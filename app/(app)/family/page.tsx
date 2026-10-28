import { Mail, MessageSquare } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PeopleTabs } from "@/components/contacts/people-tabs";
import { ProfileForm } from "@/components/contacts/profile-form";
import { Button } from "@/components/ui/button";
import { daysUntilBirthday, formatBirthday } from "@/lib/contacts/compose";
import { getProfile, listDirectory } from "@/lib/db/contacts";

export const metadata: Metadata = { title: "Family directory" };

/**
 * Account holders who chose to list themselves: name, email, phone,
 * birthday, address. Nobody's imported contacts ever appear here.
 */
export default async function FamilyPage() {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const [entries, mine] = await Promise.all([listDirectory(), getProfile(user.id)]);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div className="grid gap-3">
        <PeopleTabs active="family" />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Family directory</h1>
            <p className="text-sm text-muted-foreground">Everyone here chose to share their details with the family.</p>
          </div>
          <ProfileForm
            initial={
              mine
                ? { displayName: mine.displayName, phone: mine.phone, birthday: mine.birthday, address: mine.address, note: mine.note, listed: mine.listed }
                : null
            }
          />
        </div>
        {mine && !mine.listed ? <p className="text-sm text-muted-foreground">Your own entry is hidden from the family.</p> : null}
      </div>

      {entries.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {entries.map((e) => {
            const days = e.birthday ? daysUntilBirthday(e.birthday) : null;
            return (
              <li key={e.userId} className="grid gap-1 rounded-lg border p-3 text-sm">
                <span className="text-base font-medium">{e.displayName || e.accountName || e.email}</span>
                {e.email ? <span className="text-muted-foreground">{e.email}</span> : null}
                {e.phone ? <span className="text-muted-foreground">{e.phone}</span> : null}
                {e.birthday ? (
                  <span className="text-muted-foreground">
                    🎂 {formatBirthday(e.birthday)}
                    {days !== null && days <= 30 ? ` · ${days === 0 ? "today 🎉" : days === 1 ? "tomorrow" : `in ${days} days`}` : ""}
                  </span>
                ) : null}
                {e.address ? <span className="whitespace-pre-line text-muted-foreground">{e.address}</span> : null}
                {e.note ? <span className="text-muted-foreground italic">{e.note}</span> : null}
                <div className="flex gap-1">
                  {e.phone ? (
                    <Button asChild variant="ghost" size="sm">
                      <a href={`sms:${e.phone}`}>
                        <MessageSquare /> Text
                      </a>
                    </Button>
                  ) : null}
                  {e.email ? (
                    <Button asChild variant="ghost" size="sm">
                      <a href={`mailto:${e.email}`}>
                        <Mail /> Email
                      </a>
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          Nobody is listed yet. Use <strong>Add myself</strong> and tick &ldquo;Show me in the family directory&rdquo;.
        </p>
      )}
    </div>
  );
}
