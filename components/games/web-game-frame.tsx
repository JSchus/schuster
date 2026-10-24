"use client";

import { Maximize } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";

/**
 * An uploaded HTML5 game, served from the bucket's public webgames/ folder
 * on S3's own domain. Being cross-origin to schuster.me, the game can't read
 * the app's cookies or pages; the sandbox also blocks popups and navigating
 * the app away.
 */
export function WebGameFrame({ src, title }: { src: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  return (
    <div className="relative size-full">
      <iframe
        ref={frame}
        src={src}
        title={title}
        className="size-full border-0 bg-black"
        sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms"
        allow="fullscreen; gamepad; autoplay"
        referrerPolicy="no-referrer"
      />
      <Button
        variant="secondary"
        size="icon"
        className="absolute right-3 bottom-3 opacity-70 hover:opacity-100"
        aria-label="Full screen"
        onClick={() => void frame.current?.requestFullscreen?.()}
      >
        <Maximize />
      </Button>
    </div>
  );
}
