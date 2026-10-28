"use client";

import { QrCode, X } from "lucide-react";
import { toDataURL } from "qrcode";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Show a link as a QR code, with a PNG download (made in the browser). `path` is site-relative. */
export function QrButton({ path, name }: { path: string; name: string }) {
  const [png, setPng] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  async function open() {
    const full = `${location.origin}${path}`;
    setUrl(full);
    setPng(await toDataURL(full, { width: 512, margin: 2, errorCorrectionLevel: "M" }));
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={open} aria-label={`QR code for ${path}`}>
        <QrCode /> QR
      </Button>
      {png ? (
        <div
          role="dialog"
          aria-label="QR code"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={() => setPng(null)}
        >
          <div className="grid w-full max-w-xs gap-3 rounded-xl bg-background p-4 text-center" onClick={(e) => e.stopPropagation()}>
            <img src={png} alt={`QR code for ${url}`} className="w-full rounded-md bg-white" />
            <p className="truncate text-sm text-muted-foreground">{url}</p>
            <div className="flex justify-center gap-2">
              <Button asChild size="sm">
                <a href={png} download={`${name}-qr.png`}>
                  Download PNG
                </a>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPng(null)}>
                <X /> Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
