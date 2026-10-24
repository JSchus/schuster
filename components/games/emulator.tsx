"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { SYSTEMS, type SystemId } from "@/lib/games/systems";
import { downloadSave, listSaves, sameBytes, uploadSave } from "./cloud-saves";

type Props = {
  itemId: string;
  title: string;
  system: SystemId;
  romUrl: string;
  biosUrl?: string;
  /** Load the cloud save state as soon as the game starts. */
  resumeState?: boolean;
};

type GameManager = {
  getSaveFilePath(): string;
  getSaveFile(save?: boolean): Uint8Array | null;
  loadSaveFiles(): void;
  loadState(state: Uint8Array): void;
  FS: {
    analyzePath(p: string): { exists: boolean };
    mkdir(p: string): void;
    unlink(p: string): void;
    writeFile(p: string, data: Uint8Array): void;
  };
};

type EjsWindow = Window &
  Record<string, unknown> & { EJS_emulator?: { gameManager?: GameManager } };

const SRAM_EVERY = 60_000;

/**
 * EmulatorJS, self-hosted under /emulatorjs/ (pinned version, see
 * scripts/copy-emulatorjs.mjs). The ROM streams from a presigned S3 URL.
 * Save states and in-game (SRAM) saves go to this user's cloud slots, so a
 * game started on the laptop continues on the phone.
 *
 * EmulatorJS is configured through window.EJS_* globals and can't be torn
 * down cleanly, so leaving the page is a full navigation (see /play/[id]).
 */
export function Emulator({ itemId, title, system, romUrl, biosUrl, resumeState }: Props) {
  const started = useRef(false);
  /** Last in-game save we uploaded or restored, to skip unchanged uploads. */
  const lastSram = useRef<Uint8Array | null>(null);

  useEffect(() => {
    const w = window as unknown as EjsWindow;
    const gm = () => w.EJS_emulator?.gameManager;

    const pushSram = async () => {
      const g = gm();
      if (!g) return;
      try {
        const sram = g.getSaveFile(true);
        if (!sram?.byteLength || sameBytes(sram, lastSram.current)) return;
        const copy = sram.slice();
        await uploadSave(itemId, "sram", copy);
        lastSram.current = copy;
      } catch (err) {
        console.warn("In-game save upload failed", err);
      }
    };

    // Install EmulatorJS once (Strict Mode runs effects twice in dev; the
    // emulator can't be torn down, so only the listeners below re-register).
    if (!started.current) {
      started.current = true;
      Object.assign(w, {
        EJS_player: "#game",
        EJS_pathtodata: "/emulatorjs/data/",
        EJS_core: SYSTEMS[system].core,
        EJS_controlScheme: system,
        EJS_gameUrl: romUrl,
        EJS_gameName: title,
        EJS_gameID: itemId,
        EJS_biosUrl: biosUrl ?? "",
        EJS_threads: false,
        EJS_startOnLoaded: false,
        EJS_color: "#3b4fd8",
        EJS_backgroundColor: "#000",
        EJS_onSaveState: async ({
          state,
          screenshot,
        }: {
          state: Uint8Array;
          screenshot?: Uint8Array;
        }) => {
          const id = toast.loading("Saving to your account…");
          try {
            await uploadSave(itemId, "state", state);
            if (screenshot?.byteLength)
              await uploadSave(itemId, "screenshot", screenshot).catch(() => {});
            toast.success("Saved to your account", { id });
          } catch (err) {
            toast.error((err as Error).message, { id });
          }
        },
        EJS_onLoadState: async () => {
          try {
            const saves = await listSaves(itemId);
            if (!saves.state) return void toast("No cloud save yet. Use “Save state” first.");
            gm()?.loadState(await downloadSave(saves.state.url));
            toast.success("Loaded your cloud save");
          } catch (err) {
            toast.error((err as Error).message);
          }
        },
        EJS_onGameStart: async () => {
          try {
            const saves = await listSaves(itemId);
            const g = gm();
            // In-game save (battery / memory card) from any device.
            if (saves.sram && g) {
              const bytes = await downloadSave(saves.sram.url);
              const path = g.getSaveFilePath();
              let dir = "";
              for (const part of path.split("/").slice(0, -1)) {
                if (!part) continue;
                dir += `/${part}`;
                if (!g.FS.analyzePath(dir).exists) g.FS.mkdir(dir);
              }
              if (g.FS.analyzePath(path).exists) g.FS.unlink(path);
              g.FS.writeFile(path, bytes);
              g.loadSaveFiles();
              lastSram.current = bytes;
            }
            if (resumeState && saves.state && g) {
              g.loadState(await downloadSave(saves.state.url));
              toast.success("Resumed from your cloud save");
            }
          } catch (err) {
            console.warn("Cloud save restore failed", err);
          }
        },
      });

      const script = document.createElement("script");
      script.src = "/emulatorjs/data/loader.js";
      script.async = true;
      document.body.appendChild(script);
    }

    const timer = setInterval(pushSram, SRAM_EVERY);
    const onHide = () => document.visibilityState === "hidden" && void pushSram();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", pushSram);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", pushSram);
    };
  }, [itemId, title, system, romUrl, biosUrl, resumeState]);

  return <div id="game" className="size-full" />;
}
