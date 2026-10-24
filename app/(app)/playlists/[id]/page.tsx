import { ArrowLeft, ListMusic, Lock, Users } from "lucide-react";
import type { Metadata } from "next";
import { Link } from "next-view-transitions";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { PlaylistPlayer } from "@/components/player/playlist-player";
import { KeepOfflineButton } from "@/components/playlists/keep-offline-button";
import { PlaylistTools } from "@/components/playlists/playlist-tools";
import { Button } from "@/components/ui/button";
import { listPeople } from "@/lib/db/people";
import { getPlaylist, getPlaylistAccess, playlistTracksFor } from "@/lib/db/playlists";
import { canContribute, canEditPlaylist, VISIBILITY_LABELS, type Viewer } from "@/lib/permissions";
import { toPlayerTracks } from "@/lib/player/playlist-tracks";

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string, user: Viewer | undefined) {
  if (!UUID.test(id) || !user) return undefined;
  return getPlaylist(id, user);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const playlist = await load((await params).id, (await auth())?.user);
  return { title: playlist?.name ?? "Not found" };
}

/** One playlist: the player, "Keep offline", and (for its owner) editing and sharing. */
export default async function PlaylistPage({ params }: Props) {
  const user = (await auth())?.user;
  const playlist = await load((await params).id, user);
  if (!playlist || !user) notFound();
  const editable = canEditPlaylist(user, playlist.ownerId);
  const items = await playlistTracksFor(playlist.id, user);
  const [tracks, people, access] = await Promise.all([
    toPlayerTracks(items),
    editable ? listPeople() : Promise.resolve([]),
    editable && playlist.visibility === "people" ? getPlaylistAccess(playlist.id) : Promise.resolve([]),
  ]);
  const Icon = playlist.visibility === "private" ? Lock : playlist.visibility === "people" ? Users : ListMusic;

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/playlists">
          <ArrowLeft /> Playlists
        </Link>
      </Button>
      <div className="grid gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Icon className="size-5 text-muted-foreground" aria-hidden /> {playlist.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {playlist.ownerId === user.id ? "Your playlist" : `By ${playlist.ownerName ?? "someone"}`} ·{" "}
          {VISIBILITY_LABELS[playlist.visibility]}
        </p>
        {playlist.description ? <p className="max-w-prose text-muted-foreground">{playlist.description}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <KeepOfflineButton
          playlist={{ id: playlist.id, name: playlist.name }}
          tracks={items.map((i) => ({
            id: i.id,
            title: i.title,
            artist: i.metadata.author ?? null,
            durationSec: i.metadata.durationSec ?? null,
            mime: i.mime,
          }))}
        />
      </div>

      {editable ? (
        <PlaylistTools
          playlist={playlist}
          songs={items.map((i) => ({ id: i.id, title: i.title, artist: i.metadata.author ?? null }))}
          people={people}
          access={access}
          canShare={canContribute(user)}
        />
      ) : null}

      <PlaylistPlayer
        // Remount when the songs change, so the queue matches.
        key={tracks.map((t) => t.id).join()}
        playlistId={playlist.id}
        name={playlist.name}
        tracks={tracks}
        refreshUrl={`/api/playlists/${playlist.id}/urls`}
        syncProgress
      />
    </div>
  );
}
