"use client";

import { ListPlus, Share2 } from "lucide-react";
import { useState } from "react";
import { PlaylistEditor } from "@/components/playlists/playlist-editor";
import { SharePanel } from "@/components/sharing/share-panel";
import { ShelfForm } from "@/components/shelves/shelf-form";
import { Button } from "@/components/ui/button";
import type { Person } from "@/lib/db/people";
import type { Visibility } from "@/lib/permissions";

type Props = {
  playlist: { id: string; name: string; description: string | null; visibility: Visibility; ownerId: string };
  songs: { id: string; title: string; artist: string | null }[];
  people: Person[];
  access: string[];
  /** Public links need a member or admin. */
  canShare: boolean;
};

/** The owner's buttons: edit songs, share link, settings (rename / who can see / delete). */
export function PlaylistTools({ playlist, songs, people, access, canShare }: Props) {
  const [open, setOpen] = useState<"songs" | "share" | null>(songs.length ? null : "songs");
  const toggle = (p: "songs" | "share") => setOpen((o) => (o === p ? null : p));
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant={open === "songs" ? "secondary" : "outline"} size="sm" onClick={() => toggle("songs")}>
          <ListPlus /> Edit songs
        </Button>
        {canShare ? (
          <Button variant={open === "share" ? "secondary" : "outline"} size="sm" onClick={() => toggle("share")}>
            <Share2 /> Share link
          </Button>
        ) : null}
        <ShelfForm kind="playlist" shelf={playlist} ownerId={playlist.ownerId} people={people} access={access} />
      </div>
      {open === "songs" ? <PlaylistEditor playlistId={playlist.id} songs={songs} /> : null}
      {open === "share" ? (
        <SharePanel
          endpoint={`/api/playlists/${playlist.id}/shares`}
          inline
          downloadLabel="Let them download the songs too (otherwise they can only listen)"
        />
      ) : null}
    </div>
  );
}
