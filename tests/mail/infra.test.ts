import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => JSON.parse(readFileSync(new URL(`../../infra/${f}`, import.meta.url), "utf8"));

describe("mail infra policies", () => {
  it("the full bucket policy keeps the web-games rule and lets SES write only to inbound/", () => {
    const full = read("s3-bucket-policy.json");
    const games = read("s3-webgames-policy.json");
    expect(full.Statement).toEqual(expect.arrayContaining(games.Statement));
    const ses = full.Statement.find((s: { Sid: string }) => s.Sid === "AllowSesToStoreInboundMailOnly");
    expect(ses).toMatchObject({ Principal: { Service: "ses.amazonaws.com" }, Action: "s3:PutObject", Resource: "arn:aws:s3:::REPLACE_WITH_BUCKET_NAME/inbound/*" });
    expect(ses.Condition.StringEquals["AWS:SourceAccount"]).toBeTruthy();
    // Nothing else is public or writable by AWS services.
    expect(full.Statement).toHaveLength(games.Statement.length + 1);
  });

  it("the app may send only as m.schuster.me, and stored mail expires", () => {
    const iam = read("iam-policy.json");
    const ses = iam.Statement.find((s: { Action: string[] }) => s.Action.some((a) => a.startsWith("ses:")));
    expect(ses).toMatchObject({ Action: ["ses:SendRawEmail"], Resource: "arn:aws:ses:us-east-1:*:identity/m.schuster.me" });
    const rule = read("s3-lifecycle.json").Rules.find((r: { Filter: { Prefix: string } }) => r.Filter.Prefix === "inbound/");
    expect(rule.Expiration.Days).toBe(14);
  });
});
