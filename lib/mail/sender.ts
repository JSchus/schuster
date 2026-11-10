import "server-only";
import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { env } from "@/lib/env";

/** Sends a complete raw message. SES in production, memory in tests. */
export interface MailSender {
  sendRaw(from: string, to: string[], raw: Uint8Array): Promise<void>;
}

export class SesMailSender implements MailSender {
  constructor(private readonly client: SESClient) {}
  async sendRaw(from: string, to: string[], raw: Uint8Array) {
    await this.client.send(new SendRawEmailCommand({ Source: from, Destinations: to, RawMessage: { Data: raw } }));
  }
}

export class MemoryMailSender implements MailSender {
  readonly sent: { from: string; to: string[]; raw: string }[] = [];
  async sendRaw(from: string, to: string[], raw: Uint8Array) {
    this.sent.push({ from, to, raw: Buffer.from(raw).toString("latin1") });
  }
}

let instance: MailSender | undefined;

/** The configured sender. Uses the same AWS key and region as storage (see infra/iam-policy.json). */
export function getMailSender(): MailSender {
  if (instance) return instance;
  const e = env();
  instance =
    e.MAIL_DRIVER === "memory"
      ? new MemoryMailSender()
      : new SesMailSender(
          new SESClient({
            region: e.S3_REGION,
            endpoint: e.S3_ENDPOINT, // local emulator only; empty on AWS
            credentials:
              e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY
                ? { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY }
                : undefined,
          }),
        );
  return instance;
}

/** Override the sender (tests). */
export function setMailSender(s: MailSender | undefined) {
  instance = s;
}
