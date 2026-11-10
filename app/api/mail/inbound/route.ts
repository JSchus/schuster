import { readFileSync } from "node:fs";
import { env } from "@/lib/env";
import { handleSesNotification, type SesNotification } from "@/lib/mail/inbound";
import { getMailSender } from "@/lib/mail/sender";
import { verifySns, type SnsMessage } from "@/lib/mail/sns";
import { getStorage } from "@/lib/storage";

export const maxDuration = 60;

/**
 * Local end-to-end tests only: a certificate file to verify test-signed
 * SNS messages. Ignored on Vercel, where SNS's real certificates are used.
 */
function testCert(): ((url: string) => Promise<string>) | undefined {
  const file = process.env.MAIL_TEST_SNS_CERT_FILE;
  if (!file || process.env.VERCEL) return undefined;
  return async () => readFileSync(file, "utf8");
}

/**
 * Public endpoint for Amazon SNS: SES says "an email arrived" (or bounced,
 * or a complaint). Every message is signature-checked against SNS's own
 * certificate and our topic before anything happens.
 */
export async function POST(req: Request): Promise<Response> {
  const e = env();
  let message: SnsMessage;
  try {
    message = JSON.parse(await req.text());
    await verifySns(message, { topicArn: e.MAIL_INBOUND_TOPIC_ARN, getCert: testCert() });
  } catch (err) {
    console.warn("[mail] rejected inbound request:", (err as Error).message);
    return new Response("Forbidden", { status: 403 });
  }

  if (message.Type === "SubscriptionConfirmation") {
    // Confirm only with SNS itself.
    const url = message.SubscribeURL ?? "";
    const u = new URL(url);
    if (u.protocol !== "https:" || !/^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname)) return new Response("Bad", { status: 400 });
    await fetch(url);
    return new Response("Subscribed");
  }
  if (message.Type !== "Notification") return new Response("OK");

  try {
    const notification = JSON.parse(message.Message) as SesNotification;
    const results = await handleSesNotification(notification, {
      storage: getStorage(),
      sender: getMailSender(),
      domain: e.MAIL_DOMAIN,
    });
    return Response.json({ results });
  } catch (err) {
    // 500 makes SNS retry later (e.g. a brief S3 or SES hiccup).
    console.error("[mail] inbound failed:", err);
    return new Response("Error", { status: 500 });
  }
}

export const dynamic = "force-dynamic";
