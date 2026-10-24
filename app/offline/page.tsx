import { WifiOff } from "lucide-react";
import { OfflineBooks } from "@/components/offline-books";

export const metadata = { title: "Offline" };
export const dynamic = "force-static";

/** Shown by the service worker when a navigation fails offline. */
export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="grid w-full justify-items-center gap-3">
        <WifiOff className="size-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">You&apos;re offline</h1>
        <p className="max-w-xs text-muted-foreground">
          Most of Schuster Media needs a connection. Books you kept offline still open.
        </p>
        <OfflineBooks />
      </div>
    </main>
  );
}
