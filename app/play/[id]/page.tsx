import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { Emulator } from "@/components/games/emulator";
import { WebGameFrame } from "@/components/games/web-game-frame";
import { getReadyItem } from "@/lib/db/queries";
import { findPsxBios } from "@/lib/games/server";
import { isSystemId, SYSTEMS } from "@/lib/games/systems";
import { getStorage, webGameKey } from "@/lib/storage";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ resume?: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string) {
  if (!UUID.test(id)) return undefined;
  const item = await getReadyItem(id);
  return item?.type === "game" ? item : undefined;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = await load((await params).id);
  return { title: item ? `Playing ${item.title}` : "Not found" };
}

/**
 * Full-screen game page: EmulatorJS for console ROMs, a sandboxed frame for
 * web games. The back link is a plain <a> so leaving fully unloads the
 * emulator (it keeps global state and audio running otherwise).
 */
export default async function PlayPage({ params, searchParams }: Props) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=/play/${id}`);
  const item = await load(id);
  if (!item) notFound();
  const meta = item.metadata;
  const storage = getStorage();

  let body: React.ReactNode;
  if (meta.web?.status === "ready") {
    body = <WebGameFrame src={storage.publicUrl(webGameKey(item.id, meta.web.entry))} title={item.title} />;
  } else if (meta.web) {
    body = <Notice>This game is still being published. Open its page and choose “Republish”.</Notice>;
  } else if (!isSystemId(meta.system)) {
    body = <Notice>Choose which console this game is for on its page first.</Notice>;
  } else {
    const system = meta.system;
    const bios = system === "psx" ? await findPsxBios() : undefined;
    if (system === "psx" && !bios) {
      body = (
        <Notice>
          PlayStation games need a PS1 BIOS file.{" "}
          {session.user.role === "admin" ? "Add it on the game's page." : "Ask the admin to add it."}
        </Notice>
      );
    } else {
      const [romUrl, biosUrl] = await Promise.all([
        storage.presignGet(item.fileKey, { expiresIn: 6 * 60 * 60 }),
        bios ? storage.presignGet(bios.key, { expiresIn: 6 * 60 * 60 }) : undefined,
      ]);
      body = (
        <Emulator
          itemId={item.id}
          title={item.title}
          system={system}
          romUrl={romUrl}
          biosUrl={biosUrl}
          resumeState={(await searchParams).resume === "1"}
        />
      );
    }
  }

  return (
    <main className="fixed inset-0 flex flex-col bg-black text-white">
      <header className="flex items-center gap-2 px-2 py-2" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
        <a
          href={`/items/${item.id}`}
          className="grid size-9 place-items-center rounded-md hover:bg-white/10"
          aria-label="Back to the game's page"
        >
          <ArrowLeft className="size-4" />
        </a>
        <h1 className="truncate text-sm font-medium">{item.title}</h1>
        {isSystemId(meta.system) ? <span className="text-xs text-white/60">{SYSTEMS[meta.system].label}</span> : null}
      </header>
      <div className="min-h-0 flex-1" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {body}
      </div>
    </main>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="grid size-full place-items-center p-6 text-center text-white/80">{children}</div>;
}
