import { ArrowLeft, BookOpen, Download, Gamepad2, Headphones, Library, Lock, Play, Users } from "lucide-react";
import type { Metadata } from "next";
import { Link } from "next-view-transitions";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Cover } from "@/components/library/cover";
import { libraryHref } from "@/components/library/filter-link";
import { MakeCoverButton } from "@/components/library/make-cover-button";
import { GamePanel } from "@/components/games/game-panel";
import { ItemActions } from "@/components/items/item-actions";
import { SubtitleManager } from "@/components/player/subtitle-manager";
import { MediaTypeIcon } from "@/components/library/media-type-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { withCoverUrls } from "@/lib/covers";
import { listPeople } from "@/lib/db/people";
import { getItemAccess, getItemWithUploader, getProgress } from "@/lib/db/queries";
import { listPlaylists, playlistsHolding } from "@/lib/db/playlists";
import { listShelves, shelvesHolding } from "@/lib/db/shelves";
import { findPsxBios } from "@/lib/games/server";
import { isSystemId, SYSTEMS } from "@/lib/games/systems";
import { decodeTime, resumeTime } from "@/lib/player/position";
import { isReadable } from "@/lib/reader/progress";
import { canMakeCover, MEDIA_TYPE_LABELS } from "@/lib/media-types";
import { canContribute, canEdit as mayEdit, canEditPlaylist, VISIBILITY_LABELS, type Viewer } from "@/lib/permissions";
import { inlineKind } from "@/lib/sharing/open";
import { formatBytes, formatDuration } from "@/lib/utils";

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string, user: Viewer | undefined) {
  if (!UUID.test(id) || !user) return undefined;
  return getItemWithUploader(id, user);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const row = await load((await params).id, (await auth())?.user);
  return { title: row?.item.title ?? "Not found" };
}

/** Item detail: cover, metadata and a presigned download link. */
export default async function ItemPage({ params }: Props) {
  const session = await auth();
  const user = session?.user;
  const row = await load((await params).id, user);
  if (!row || !user) notFound();
  const [item] = await withCoverUrls([row.item]);
  if (!item) notFound();
  const m = item.metadata;
  const canEdit = mayEdit(user, item.addedBy);
  const [shelves, people, access] = await Promise.all([
    listShelves(user),
    canEdit ? listPeople() : Promise.resolve([]),
    canEdit && item.visibility === "people" ? getItemAccess(item.id) : Promise.resolve([]),
  ]);
  const holding = new Set(await shelvesHolding(item.id, shelves.map((s) => s.id)));
  const onShelves = shelves.filter((s) => holding.has(s.id));
  const myPlaylists =
    item.type === "audio" ? (await listPlaylists(user)).filter((p) => canEditPlaylist(user, p.ownerId)) : undefined;
  const inPlaylists = myPlaylists ? new Set(await playlistsHolding(item.id, myPlaylists.map((p) => p.id))) : new Set<string>();
  const pickerPlaylists = myPlaylists?.map((p) => ({ id: p.id, name: p.name, has: inPlaylists.has(p.id) }));
  const pickerShelves = canContribute(user)
    ? shelves.filter((s) => mayEdit(user, s.ownerId)).map((s) => ({ id: s.id, name: s.name, has: holding.has(s.id) }))
    : undefined;
  const readable = item.type === "book" && isReadable(item.mime);
  const playable = item.type === "video" || item.type === "audio";
  const progress = (readable || playable) && user ? await getProgress(user.id, item.id) : undefined;
  // Mirrors the player: no "Resume" if you stopped in the credits.
  const resumeAt = playable ? resumeTime(decodeTime(progress?.position), m.durationSec ?? Number.NaN) : 0;
  const isGame = item.type === "game";
  const system = isSystemId(m.system) ? m.system : undefined;
  const gameReady = isGame && (m.web ? m.web.status === "ready" : !!system);
  const biosMissing = system === "psx" ? !(await findPsxBios()) : false;
  const primaryAction = readable || playable || gameReady;

  const facts: [string, string | undefined][] = [
    ["Author", m.author],
    ["Publisher", m.publisher],
    ["Console", system ? SYSTEMS[system].label : m.web ? "Web game" : undefined],
    ["Duration", m.durationSec ? formatDuration(m.durationSec) : undefined],
    ["Resolution", m.width && m.height ? `${m.width}×${m.height}` : undefined],
    ["Language", m.language],
    ["Size", formatBytes(item.size)],
    ["Format", item.mime],
    ["Added by", row.uploaderName ?? row.uploaderEmail ?? undefined],
    ["Added", item.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })],
  ];

  return (
    <article className="grid gap-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/">
          <ArrowLeft /> Library
        </Link>
      </Button>
      <div className="grid gap-8 md:grid-cols-[minmax(0,18rem)_1fr]">
        <Cover
          url={item.coverUrl}
          title={item.title}
          type={item.type}
          transitionName={`cover-${item.id}`}
          className="mx-auto w-full max-w-xs shadow-lg md:max-w-none"
          eager
        />
        <div className="grid content-start gap-5">
          <div className="grid gap-2">
            <Badge variant="secondary" className="gap-1">
              <MediaTypeIcon type={item.type} /> {MEDIA_TYPE_LABELS[item.type]}
            </Badge>
            <h1 className="text-3xl font-semibold tracking-tight text-balance">{item.title}</h1>
            {item.visibility !== "everyone" ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {item.visibility === "private" ? <Lock className="size-4" /> : <Users className="size-4" />}
                {item.visibility === "private" ? "Only the uploader can see this" : VISIBILITY_LABELS.people}
              </p>
            ) : null}
            {m.author ? <p className="text-lg text-muted-foreground">{m.author}</p> : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Route handler 302s to a presigned S3 URL; bytes never touch Vercel. */}
            {readable ? (
              <Button asChild size="lg">
                <Link href={`/read/${item.id}`}>
                  <BookOpen /> {progress && progress.percent > 0 ? `Continue · ${progress.percent}%` : "Read"}
                </Link>
              </Button>
            ) : null}
            {playable ? (
              <Button asChild size="lg">
                <Link href={`/${item.type === "video" ? "watch" : "listen"}/${item.id}`}>
                  {item.type === "video" ? <Play /> : <Headphones />}
                  {resumeAt > 0 ? `Resume · ${formatDuration(resumeAt)}` : item.type === "video" ? "Play" : "Listen"}
                </Link>
              </Button>
            ) : null}
            {gameReady ? (
              <Button asChild size="lg">
                {/* Full page load: the emulator needs a fresh page each time. */}
                <a href={`/play/${item.id}`}>
                  <Gamepad2 /> Play
                </a>
              </Button>
            ) : null}
            <Button asChild size="lg" variant={primaryAction ? "outline" : "default"}>
              <a href={`/api/items/${item.id}/download`} download>
                <Download /> Download
              </a>
            </Button>
            {canEdit && canMakeCover(item.type, item.mime) ? (
              <MakeCoverButton itemId={item.id} type={item.type} mime={item.mime} hasCover={!!item.coverKey} />
            ) : null}
          </div>

          <ItemActions
            item={{
              id: item.id,
              title: item.title,
              author: m.author ?? null,
              description: item.description,
              tags: item.tags,
              visibility: item.visibility,
              addedBy: item.addedBy,
            }}
            canEdit={canEdit}
            shelves={pickerShelves}
            playlists={pickerPlaylists}
            people={people}
            access={access}
            inline={!!inlineKind(item)}
          />

          {item.description ? (
            <p className="max-w-prose leading-relaxed whitespace-pre-line text-muted-foreground">
              {item.description}
            </p>
          ) : null}

          {isGame ? (
            <GamePanel
              itemId={item.id}
              system={system}
              isWeb={!!m.web}
              canEdit={canEdit}
              isAdmin={user.role === "admin"}
              biosMissing={biosMissing}
            />
          ) : null}

          {canEdit && item.type === "video" ? <SubtitleManager itemId={item.id} tracks={m.subtitles ?? []} /> : null}

          {onShelves.length ? (
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <Library className="size-4 text-muted-foreground" aria-label="On shelves" />
              {onShelves.map((s) => (
                <Badge key={s.id} asChild variant="secondary">
                  <Link href={`/shelves/${s.id}`}>{s.name}</Link>
                </Badge>
              ))}
            </div>
          ) : null}

          {item.tags.length ? (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((t) => (
                <Badge key={t} asChild variant="outline">
                  <Link href={libraryHref({ tag: t })}>#{t}</Link>
                </Badge>
              ))}
            </div>
          ) : null}

          <dl className="grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {facts
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="truncate">{v}</dd>
                </div>
              ))}
          </dl>
        </div>
      </div>
    </article>
  );
}
