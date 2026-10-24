"use client";

import { Globe, Lock, Users } from "lucide-react";
import type { Person } from "@/lib/db/people";
import { VISIBILITIES, VISIBILITY_LABELS, type Visibility } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const ICONS = { everyone: Globe, people: Users, private: Lock } as const;

export function personLabel(p: Person) {
  return p.name || p.email || "Someone";
}

type Props = {
  value: Visibility;
  onChange: (v: Visibility) => void;
  /** Everyone with an account (the owner is left out of the list). */
  people: Person[];
  ownerId: string | null;
  selected: string[];
  onSelected: (ids: string[]) => void;
  /** "item" or "shelf", for the hint text. */
  noun: string;
};

/** "Who can see this?" — everyone, specific people (checkboxes), or only the owner. */
export function VisibilityFields({ value, onChange, people, ownerId, selected, onSelected, noun }: Props) {
  const others = people.filter((p) => p.id !== ownerId);
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">Who can see this {noun}?</legend>
      <div className="flex flex-wrap gap-2">
        {VISIBILITIES.map((v) => {
          const Icon = ICONS[v];
          return (
            <label
              key={v}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                value === v ? "border-primary bg-primary/10" : "text-muted-foreground",
              )}
            >
              <input type="radio" name={`visibility-${noun}`} value={v} checked={value === v} onChange={() => onChange(v)} className="sr-only" />
              <Icon className="size-4" /> {VISIBILITY_LABELS[v]}
            </label>
          );
        })}
      </div>
      {value === "people" ? (
        others.length ? (
          <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border p-2">
            {others.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={(e) => onSelected(e.target.checked ? [...selected, p.id] : selected.filter((id) => id !== p.id))}
                />
                <span className="truncate">{personLabel(p)}</span>
                {p.name && p.email ? <span className="truncate text-xs text-muted-foreground">{p.email}</span> : null}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nobody else has an account yet.</p>
        )
      ) : null}
      <p className="text-xs text-muted-foreground">Admins can always see everything.</p>
    </fieldset>
  );
}
