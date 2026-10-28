import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { LinkManager } from "@/components/links/link-manager";
import { listLinks } from "@/lib/db/links";
import { linkJson } from "@/lib/links/link-json";
import { canContribute } from "@/lib/permissions";

export const metadata: Metadata = { title: "Short links" };

/** Short links (schuster.me/go/…). Members and admins; admins see everyone's. */
export default async function LinksPage() {
  const user = (await auth())?.user;
  if (!user || !canContribute(user)) notFound();
  const links = (await listLinks(user)).map((l) => linkJson(l, user.id));
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Short links</h1>
        <p className="text-sm text-muted-foreground">
          Short addresses like schuster.me/go/recital that open any web page. Anyone with the link can use it.
        </p>
      </div>
      <LinkManager initial={links} showOwner={user.role === "admin"} />
    </div>
  );
}
