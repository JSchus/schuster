import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };
export const dynamic = "force-static";

/** Shown by the service worker when a navigation fails offline. */
export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="grid justify-items-center gap-3">
        <WifiOff className="size-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">You&apos;re offline</h1>
        <p className="max-w-xs text-muted-foreground">
          Schuster Media needs a connection right now. Offline reading arrives with the EPUB reader.
        </p>
      </div>
    </main>
  );
}
