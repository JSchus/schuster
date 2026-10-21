import { Search } from "lucide-react";
import Form from "next/form";
import { Input } from "@/components/ui/input";
import type { LibraryParams } from "@/components/library/filter-link";

/**
 * GET search form. `next/form` does a client-side navigation to `/?q=...`
 * (and works without JS), keeping the current type/tag filters.
 */
export function SearchBox({ params }: { params: LibraryParams }) {
  return (
    <Form action="/" className="relative w-full sm:max-w-xs" role="search">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        name="q"
        defaultValue={params.q}
        placeholder="Search titles, authors…"
        aria-label="Search the library"
        className="pl-9"
        enterKeyHint="search"
      />
      {params.type ? <input type="hidden" name="type" value={params.type} /> : null}
      {params.tag ? <input type="hidden" name="tag" value={params.tag} /> : null}
    </Form>
  );
}
