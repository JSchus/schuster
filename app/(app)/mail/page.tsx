import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { AliasManager } from "@/components/mail/alias-manager";
import { ReplyAddresses } from "@/components/mail/reply-addresses";
import { listAliases, listReplyAddresses } from "@/lib/db/mail";
import { listPeople } from "@/lib/db/people";
import { env } from "@/lib/env";
import { aliasJson } from "@/lib/mail/alias-json";
import { canContribute } from "@/lib/permissions";

export const metadata: Metadata = { title: "Email aliases" };

/** Email aliases on m.schuster.me (members and admins). */
export default async function MailPage() {
  const user = (await auth())?.user;
  if (!user || !canContribute(user)) notFound();
  const domain = env().MAIL_DOMAIN;
  const [aliases, people, replyFrom] = await Promise.all([listAliases(user.id), listPeople(), listReplyAddresses(user.id)]);
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Email aliases</h1>
        <p className="text-sm text-muted-foreground">
          Give websites and people an address like <strong>netflix@{domain}</strong> instead of your real one. Mail arrives in
          your normal inbox ({user.email}). <strong>Just hit Reply</strong>: they&apos;ll only ever see the alias. If an
          alias starts getting spam, turn it off.
        </p>
      </div>
      <AliasManager initial={aliases.map((a) => aliasJson(a, domain, user.id))} people={people} me={user.id} domain={domain} accountEmail={user.email ?? "your sign-in address"} />
      <ReplyAddresses
        initial={replyFrom.map((r) => ({ id: r.id, email: r.email, confirmed: !!r.confirmedAt }))}
        accountEmail={user.email ?? "your sign-in address"}
      />
    </div>
  );
}
