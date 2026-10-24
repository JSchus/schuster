"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { READER_COLORS, type ReaderSettings, type ReaderTheme } from "./use-reader-settings";

type Props = { settings: ReaderSettings; update: (patch: Partial<ReaderSettings>) => void; isPdf: boolean };

/** Text size, colours, font and layout. PDFs have fixed text, so "size" zooms the page instead. */
export function ReaderSettingsPanel({ settings, update, isPdf }: Props) {
  return (
    <div className="grid gap-4 p-4 text-sm">
      <Row label={isPdf ? "Zoom" : "Text size"}>
        <Button variant="outline" size="icon" aria-label="Smaller" onClick={() => update({ fontSize: settings.fontSize - 10 })}>
          <Minus />
        </Button>
        <span className="w-12 text-center tabular-nums">{settings.fontSize}%</span>
        <Button variant="outline" size="icon" aria-label="Larger" onClick={() => update({ fontSize: settings.fontSize + 10 })}>
          <Plus />
        </Button>
      </Row>
      <Row label="Colours">
        {(Object.keys(READER_COLORS) as ReaderTheme[]).map((t) => (
          <button
            key={t}
            onClick={() => update({ theme: t })}
            aria-pressed={settings.theme === t}
            className={cn(
              "h-9 w-16 rounded-md border text-xs capitalize",
              settings.theme === t && "ring-2 ring-primary ring-offset-2 ring-offset-background",
            )}
            style={{ background: READER_COLORS[t].bg, color: READER_COLORS[t].fg }}
          >
            {t}
          </button>
        ))}
      </Row>
      {!isPdf ? (
        <Row label="Font">
          <Choice active={settings.font === "serif"} onClick={() => update({ font: "serif" })} className="font-serif">
            Serif
          </Choice>
          <Choice active={settings.font === "sans"} onClick={() => update({ font: "sans" })}>
            Sans
          </Choice>
        </Row>
      ) : null}
      <Row label="Layout">
        <Choice active={settings.layout === "pages"} onClick={() => update({ layout: "pages" })}>
          Pages
        </Choice>
        <Choice active={settings.layout === "scroll"} onClick={() => update({ layout: "scroll" })}>
          Scroll
        </Choice>
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function Choice({
  active,
  className,
  ...props
}: React.ComponentProps<"button"> & { active: boolean }) {
  return (
    <button
      aria-pressed={active}
      className={cn("h-9 rounded-md border px-3", active && "border-primary bg-primary text-primary-foreground", className)}
      {...props}
    />
  );
}
