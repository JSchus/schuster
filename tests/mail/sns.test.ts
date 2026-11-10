import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isSnsCertUrl, type SnsMessage, stringToSign, verifySns } from "@/lib/mail/sns";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
const TOPIC = "arn:aws:sns:us-east-1:123456789012:schuster-mail";
const NOW = Date.parse("2026-11-10T12:00:00Z");

function signed(over: Partial<SnsMessage> = {}, version = "2"): SnsMessage {
  const m: SnsMessage = {
    Type: "Notification",
    MessageId: "id-1",
    TopicArn: TOPIC,
    Message: '{"notificationType":"Received"}',
    Timestamp: new Date(NOW - 1000).toISOString(),
    SignatureVersion: version,
    Signature: "",
    SigningCertURL: "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc.pem",
    ...over,
  };
  m.Signature = createSign(version === "1" ? "RSA-SHA1" : "RSA-SHA256").update(stringToSign(m)).sign(privateKey, "base64");
  return m;
}
const opts = { topicArn: TOPIC, getCert: async () => pem, now: NOW };

describe("SNS signatures", () => {
  it("accepts genuine messages (versions 1 and 2)", async () => {
    await expect(verifySns(signed(), opts)).resolves.toBeUndefined();
    await expect(verifySns(signed({}, "1"), opts)).resolves.toBeUndefined();
    const sub = signed({ Type: "SubscriptionConfirmation", Token: "t", SubscribeURL: "https://sns.us-east-1.amazonaws.com/?Action=Confirm" });
    await expect(verifySns(sub, opts)).resolves.toBeUndefined();
  });

  it("rejects tampering, other topics, old messages and foreign certificates", async () => {
    await expect(verifySns({ ...signed(), Message: '{"evil":1}' }, opts)).rejects.toThrow(/signature/);
    await expect(verifySns(signed({ TopicArn: "arn:aws:sns:us-east-1:999:other" }), opts)).rejects.toThrow(/topic/);
    await expect(verifySns(signed(), { ...opts, topicArn: undefined })).rejects.toThrow(/topic/);
    await expect(verifySns(signed({ Timestamp: new Date(NOW - 2 * 3_600_000).toISOString() }), opts)).rejects.toThrow(/Stale/);
    await expect(verifySns(signed({ SigningCertURL: "https://evil.com/sns.us-east-1.amazonaws.com.pem" }), opts)).rejects.toThrow(/certificate/);
    await expect(verifySns(signed({}, "3"), opts)).rejects.toThrow(/version/);
  });

  it("only trusts SNS-hosted https certificates", () => {
    expect(isSnsCertUrl("https://sns.us-east-1.amazonaws.com/x.pem")).toBe(true);
    expect(isSnsCertUrl("http://sns.us-east-1.amazonaws.com/x.pem")).toBe(false);
    expect(isSnsCertUrl("https://sns.us-east-1.amazonaws.com.evil.com/x.pem")).toBe(false);
    expect(isSnsCertUrl("not a url")).toBe(false);
  });
});
