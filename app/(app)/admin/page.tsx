import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Approvals } from "@/components/admin/approvals";
import { InviteManager } from "@/components/admin/invite-manager";
import { StaleUploads } from "@/components/admin/stale-uploads";
import { UserRow } from "@/components/admin/user-row";
import { activeInvites, listUsersWithStats, pendingApprovals, totalStorage } from "@/lib/db/people";
import { stalePendingItems } from "@/lib/db/queries";
import { formatBytes } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin" };

/** Dates on this page are shown in Chicago time. */
const date = (d: Date) => d.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "America/Chicago" });

/** People, roles, invites, storage use and unfinished uploads. Admins only. */
export default async function AdminPage() {
  const user = (await auth())?.user;
  if (user?.role !== "admin") notFound();
  const [users, invites, pending, storage, stale] = await Promise.all([
    listUsersWithStats(),
    activeInvites(),
    pendingApprovals(),
    totalStorage(),
    stalePendingItems(24),
  ]);

  return (
    <div className="grid gap-10">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>

      <Section title="Invite someone" hint="Send them the link. They enter their email and create a passkey; no password needed.">
        <InviteManager
          invites={invites.map((i) => ({
            id: i.id,
            token: i.token,
            role: i.role,
            note: i.note,
            uses: i.uses,
            maxUses: i.maxUses,
            expires: date(i.expiresAt),
          }))}
        />
      </Section>

      <Section title="People" hint="Members can upload and share. Viewers can only read, watch and play. Admins can do everything.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">Person</th>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">Uploads</th>
                <th className="pb-2 font-medium">Storage</th>
                <th className="pb-2 font-medium">Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  isSelf={u.id === user.id}
                  user={{
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    role: u.role,
                    items: u.items,
                    storage: formatBytes(u.bytes),
                    joined: date(u.createdAt),
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Allow an email directly" hint="For people you'd rather not send a link: add their email, then tell them to sign in at schuster.me.">
        <Approvals pending={pending} />
      </Section>

      <Section title="Storage" hint="What the library holds in S3 (finished uploads).">
        <p className="text-sm">
          <strong>{formatBytes(storage.bytes)}</strong> in {storage.items} {storage.items === 1 ? "item" : "items"}
        </p>
        <h3 className="mt-4 mb-2 text-sm font-medium">Unfinished uploads (older than a day)</h3>
        <StaleUploads
          uploads={stale.map((s) => ({ id: s.id, title: s.title, size: formatBytes(s.size), started: date(s.createdAt) }))}
        />
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}
