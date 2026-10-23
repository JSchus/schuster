import { LogOut, Upload } from "lucide-react";
import { Link } from "next-view-transitions";
import { signOut } from "@/auth";
import { AddPasskeyButton } from "@/components/auth/add-passkey-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

/** Sticky top bar: brand, upload, passkey prompt, theme, sign out. */
export function SiteHeader({ user }: { user: { name?: string | null; email?: string | null } }) {
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
        <Button asChild size="sm">
          <Link href="/upload">
            <Upload /> <span className="hidden sm:inline">Upload</span>
          </Link>
        </Button>
        <AddPasskeyButton />
        <ThemeToggle />
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <Button variant="ghost" size="icon" type="submit" aria-label={`Sign out ${user.email ?? ""}`}>
            <LogOut />
          </Button>
        </form>
      </div>
    </header>
  );
}
