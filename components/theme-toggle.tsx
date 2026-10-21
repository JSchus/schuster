"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const ORDER = ["system", "light", "dark"] as const;
const ICONS = { system: Monitor, light: Sun, dark: Moon };

/** Cycles system → light → dark. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // Theme is unknown during SSR; render a stable icon until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = (mounted && (theme as (typeof ORDER)[number])) || "system";
  const Icon = ICONS[current] ?? Monitor;
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!;

  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(next)} aria-label={`Theme: ${current}. Switch to ${next}`}>
      <Icon />
    </Button>
  );
}
