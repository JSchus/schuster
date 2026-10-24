import { Download, Link2Off, ListMusic, Lock } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Cover } from "@/components/library/cover";
import { PlaylistPlayer } from "@/components/player/playlist-player";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { withCoverUrls } from "@/lib/covers";
import { countShareView, getShare } from "@/lib/db/shares";
import { env } from "@/lib/env";
import { toPlayerTracks } from "@/lib/player/playlist-tracks";
import { inlineKind, resolveShare, sharedPlaylistTracks, shareUrlLifetime } from "@/lib/sharing/open";
import { isTokenShape, shareCookieName, shareUnlockValue, verifyPassword } from "@/lib/sharing/tokens";
import { getStorage } from "@/lib/storage";
import { formatBytes } from "@/lib/utils";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ wrong?: string }> };

// Share pages are private: no indexing, and the token never leaks via Referer.
export const metadata: Metadata = {
  title: "Shared with you",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Check the password and remember it for 12 hours in an httpOnly cookie. */
async function unlock(token: string, formData: FormData) {
  "use server";
  const share = isTokenShape(token) ? await getShare(token) : undefined;
  const password = String(formData.get("password") ?? "");
  if (!share?.passwordHash || !(await verifyPassword(password, share.passwordHash))) {
    redirect(`/s/${token}?wrong=1`);
  }
  (await cookies()).set(shareCookieName(token), shareUnlockValue(env().AUTH_SECRET, token, share.passwordHash), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 3600,
  });
  redirect(`/s/${token}`);
}

/**
 * Public page for one shared item: plays video/audio or shows an image
 * inline (presigned S3 URLs), or offers the file as a download. No account
 * needed; the link expires and can be turned off by its owner.
 */
export default async function SharePage({ params, searchParams }: Props) {
  const { token } = await params;
  const { wrong } = await searchParams;
  const found = await resolveShare(token);

  if (!found) {
    return (
      <Shell>
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <Link2Off className="mx-auto size-8 text-muted-foreground" />
            <CardTitle>This link doesn&apos;t work any more</CardTitle>
            <CardDescription>It may have expired or been turned off. Ask the person who sent it for a new one.</CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    );
  }

  if (found.locked) {
    return (
      <Shell>
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <Lock className="mx-auto size-8 text-muted-foreground" />
            <CardTitle>Password needed</CardTitle>
            <CardDescription>Someone shared something with you. Enter the password they gave you.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={unlock.bind(null, token)} className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="share-pw">Password</Label>
                <Input id="share-pw" name="password" type="password" autoComplete="off" required autoFocus />
              </div>
              {wrong ? <p className="text-sm text-destructive">That password isn&apos;t right.</p> : null}
              <Button type="submit">Open</Button>
            </form>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (found.kind === "playlist") {
    const { share, playlist } = found;
    await countShareView(token);
    const tracks = await toPlayerTracks(await sharedPlaylistTracks(share), shareUrlLifetime(share.expiresAt));
    return (
      <Shell>
        <article className="grid w-full max-w-xl gap-6">
          <div className="grid gap-1 text-center">
            <ListMusic className="mx-auto size-8 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{playlist.name}</h1>
            {playlist.description ? <p className="text-muted-foreground">{playlist.description}</p> : null}
          </div>
          <PlaylistPlayer
            playlistId={`share-${playlist.id}`}
            name={playlist.name}
            tracks={tracks}
            downloadPrefix={share.allowDownload ? `/api/s/${token}/download?item=` : undefined}
            noDownload={!share.allowDownload}
          />
          <ShareFooter expiresAt={share.expiresAt} />
        </article>
      </Shell>
    );
  }

  const { share, item } = found;
  await countShareView(token);
  const kind = inlineKind(item);
  const storage = getStorage();
  const lifetime = shareUrlLifetime(share.expiresAt);
  const [[withCover], src] = await Promise.all([
    withCoverUrls([item]),
    kind ? storage.presignGet(item.fileKey, { expiresIn: lifetime }) : Promise.resolve(null),
  ]);
  const poster = withCover?.coverUrl ?? undefined;
  const canDownload = share.allowDownload || !kind;

  return (
    <Shell>
      <article className="grid w-full max-w-4xl gap-6">
        {kind === "video" && src ? (
          <video
            src={src}
            poster={poster}
            controls
            // Hides the browser's own "Download" menu entry (a hint, not protection).
            controlsList={share.allowDownload ? undefined : "nodownload"}
            playsInline
            preload="metadata"
            className="max-h-[75dvh] w-full rounded-lg bg-black"
          />
        ) : kind === "audio" && src ? (
          <div className="grid justify-items-center gap-4">
            {poster ? <Cover url={poster} title={item.title} type={item.type} className="w-full max-w-64" eager /> : null}
            <audio src={src} controls controlsList={share.allowDownload ? undefined : "nodownload"} preload="metadata" className="w-full max-w-xl" />
          </div>
        ) : kind === "image" && src ? (
          <img src={src} alt={item.title} className="mx-auto max-h-[75dvh] w-auto rounded-lg" />
        ) : (
          <Cover url={poster ?? null} title={item.title} type={item.type} className="mx-auto w-full max-w-64" eager />
        )}

        <div className="grid gap-3 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{item.title}</h1>
          {item.metadata.author ? <p className="text-muted-foreground">{item.metadata.author}</p> : null}
          {item.description ? (
            <p className="mx-auto max-w-prose leading-relaxed whitespace-pre-line text-muted-foreground">{item.description}</p>
          ) : null}
          {canDownload ? (
            <Button asChild size="lg" variant={kind ? "outline" : "default"} className="mx-auto">
              <a href={`/api/s/${token}/download`} rel="noreferrer">
                <Download /> Download · {formatBytes(item.size)}
              </a>
            </Button>
          ) : null}
          <ShareFooter expiresAt={share.expiresAt} />
        </div>
      </article>
    </Shell>
  );
}

function ShareFooter({ expiresAt }: { expiresAt: Date }) {
  return (
    <p className="text-center text-xs text-muted-foreground">
      Shared from Schuster Media · link works until{" "}
      {expiresAt.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "America/Chicago" })}
    </p>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="absolute top-4 right-4" style={{ marginTop: "env(safe-area-inset-top)" }}>
        <ThemeToggle />
      </div>
      {children}
    </main>
  );
}
