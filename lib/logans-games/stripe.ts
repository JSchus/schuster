import "server-only";
import { env } from "@/lib/env";

/**
 * The two Stripe calls the store needs, over plain HTTPS (no SDK).
 * Card details are only ever typed on Stripe's own checkout page.
 */
export interface StripeApi {
  createCheckout(input: {
    name: string;
    description: string;
    cents: number;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string; url: string }>;
  getCheckout(id: string): Promise<{ id: string; paid: boolean; cents: number; metadata: Record<string, string> }>;
}

class HttpStripe implements StripeApi {
  constructor(private readonly key: string) {}
  private async call(method: "GET" | "POST", path: string, form?: URLSearchParams) {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.key}`, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      body: form,
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
    if (!res.ok) throw new Error(`Stripe ${res.status}: ${body.error?.message ?? "request failed"}`);
    return body;
  }
  async createCheckout(i: Parameters<StripeApi["createCheckout"]>[0]) {
    const form = new URLSearchParams({
      mode: "payment",
      success_url: i.successUrl,
      cancel_url: i.cancelUrl,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(i.cents),
      "line_items[0][price_data][product_data][name]": i.name,
      "line_items[0][price_data][product_data][description]": i.description,
    });
    for (const [k, v] of Object.entries(i.metadata)) form.set(`metadata[${k}]`, v);
    const s = await this.call("POST", "checkout/sessions", form);
    return { id: String(s.id), url: String(s.url) };
  }
  async getCheckout(id: string) {
    const s = await this.call("GET", `checkout/sessions/${encodeURIComponent(id)}`);
    return { id: String(s.id), paid: s.payment_status === "paid", cents: Number(s.amount_total), metadata: (s.metadata as Record<string, string>) ?? {} };
  }
}

let override: StripeApi | null | undefined;

/** The configured Stripe, or null when the store isn't open (no key set). */
export function getStripe(): StripeApi | null {
  if (override !== undefined) return override;
  const key = env().STRIPE_SECRET_KEY;
  return key ? new HttpStripe(key) : null;
}

/** Tests only. */
export function setStripe(s: StripeApi | null | undefined) {
  override = s;
}
