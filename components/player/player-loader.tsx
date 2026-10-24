"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { MediaPlayer } from "./media-player";

/** Client-only: the player reads localStorage and resumes from it on first render. */
const LazyPlayer = dynamic(() => import("./media-player").then((m) => m.MediaPlayer), {
  ssr: false,
  loading: () => <div className="aspect-video w-full animate-pulse rounded-lg bg-muted" />,
});

export function PlayerLoader(props: ComponentProps<typeof MediaPlayer>) {
  return <LazyPlayer {...props} />;
}
