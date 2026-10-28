"use client";

import { Link2, LogOut, Menu, Shield } from "lucide-react";
import { Link } from "next-view-transitions";
import { useEffect, useRef, useState } from "react";
import { AddPasskeyButton } from "@/components/auth/add-passkey-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

type Props = {
  email: string | null | undefined;
  showLinks: boolean;
  showAdmin: boolean;
  signOut: () => Promise<void>;
};

/** The less-used things (short links, admin, passkey, theme, sign out), so the header fits on a phone. */
export function AccountMenu({ email, showLinks, showAdmin, signOut }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const item = "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted";
  return (
    <div ref={box} className="relative">
      <Button variant="ghost" size="icon" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Menu />
      </Button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 grid w-56 gap-1 rounded-lg border bg-background p-1 shadow-lg" onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>
          {email ? <p className="truncate px-3 py-1.5 text-xs text-muted-foreground">{email}</p> : null}
          {showLinks ? (
            <Link href="/links" className={item}>
              <Link2 className="size-4" /> Short links
            </Link>
          ) : null}
          {showAdmin ? (
            <Link href="/admin" className={item}>
              <Shield className="size-4" /> Admin
            </Link>
          ) : null}
          <div className="flex items-center gap-1 px-1">
            <AddPasskeyButton />
            <span className="text-sm text-muted-foreground">Passkey</span>
            <span className="ml-auto" />
            <ThemeToggle />
          </div>
          <form action={signOut}>
            <button type="submit" className={item}>
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
