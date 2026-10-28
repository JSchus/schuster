import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AddressBook } from "@/components/contacts/address-book";
import { PeopleTabs } from "@/components/contacts/people-tabs";
import { contactJson } from "@/lib/contacts/contact-json";
import { listContacts } from "@/lib/db/contacts";

export const metadata: Metadata = { title: "Contacts" };

/** Your private address book. Only you can see it, not even admins. */
export default async function ContactsPage() {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const contacts = (await listContacts(user.id)).map(contactJson);
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div className="grid gap-3">
        <PeopleTabs active="contacts" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My contacts</h1>
          <p className="text-sm text-muted-foreground">Private to you. Use them to invite people and send links.</p>
        </div>
      </div>
      <AddressBook initial={contacts} isAdmin={user.role === "admin"} myName={user.name?.split(" ")[0] || user.email?.split("@")[0] || "Someone"} />
    </div>
  );
}
