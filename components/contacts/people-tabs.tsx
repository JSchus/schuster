import { Link } from "next-view-transitions";
import { cn } from "@/lib/utils";

/** Switch between your private contacts and the shared family directory. */
export function PeopleTabs({ active }: { active: "contacts" | "family" }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={cn("rounded-md px-3 py-1.5 text-sm font-medium", on ? "bg-muted" : "text-muted-foreground hover:bg-muted/60")}
    >
      {label}
    </Link>
  );
  return (
    <nav className="flex gap-1" aria-label="People">
      {tab("/contacts", "My contacts", active === "contacts")}
      {tab("/family", "Family directory", active === "family")}
    </nav>
  );
}
