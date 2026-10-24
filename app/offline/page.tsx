import { WifiOff } from "lucide-react";
import { OfflineBooks } from "@/components/offline-books";
import { OfflinePlaylists } from "@/components/playlists/offline-playlists";

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
          Most of Schuster Media needs a connection. Books and playlists you kept offline still work.
        </p>
        <OfflineBooks />
        <OfflinePlaylists />
      </div>
    </main>
  );
}
