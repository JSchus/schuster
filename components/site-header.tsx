import { Library, ListMusic, Upload, Users } from "lucide-react";
import { Link } from "next-view-transitions";
import { signOut } from "@/auth";
import { AccountMenu } from "@/components/account-menu";
import { Button } from "@/components/ui/button";
import { canContribute, type Role } from "@/lib/permissions";

/** Sticky top bar: brand, shelves, playlists, people, upload, and a menu for the rest. */
export function SiteHeader({ user }: { user: { name?: string | null; email?: string | null; role: Role } }) {
  return (
    <header
      className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      style={{ viewTransitionName: "site-header", paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        <Link href="/" className="mr-auto flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            S
          </span>
          <span className="hidden sm:inline">Schuster Media</span>
        </Link>
        <Button asChild variant="ghost" size="sm">
          <Link href="/shelves" aria-label="Shelves">
            <Library /> <span className="hidden sm:inline">Shelves</span>
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/playlists" aria-label="Playlists">
            <ListMusic /> <span className="hidden sm:inline">Playlists</span>
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/contacts" aria-label="People">
            <Users /> <span className="hidden sm:inline">People</span>
          </Link>
        </Button>
        {canContribute(user) ? (
          <Button asChild size="sm">
            <Link href="/upload">
              <Upload /> <span className="hidden sm:inline">Upload</span>
            </Link>
          </Button>
        ) : null}
        <AccountMenu
          email={user.email}
          showLinks={canContribute(user)}
          showAdmin={user.role === "admin"}
          signOut={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        />
      </div>
    </header>
  );
}
