import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ReaderLoader } from "@/components/reader/reader-loader";
import { getProgress, getReadyItem } from "@/lib/db/queries";
import { isReadable } from "@/lib/reader/progress";
import { getStorage } from "@/lib/storage";

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string) {
  const user = (await auth())?.user;
  if (!UUID.test(id) || !user) return undefined;
  const item = await getReadyItem(id, user);
  return item?.type === "book" && isReadable(item.mime) ? item : undefined;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = await load((await params).id);
  return { title: item ? `Reading ${item.title}` : "Not found" };
}

/**
 * Full-screen reader. The book itself is fetched by the browser from a
 * presigned S3 URL (valid for a long reading session), never via Vercel.
 */
export default async function ReadPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=/read/${id}`);
  const item = await load(id);
  if (!item) notFound();

  const [progress, sourceUrl] = await Promise.all([
    getProgress(session.user.id, item.id),
    getStorage().presignGet(item.fileKey, { expiresIn: 6 * 60 * 60 }),
  ]);

  return (
    <ReaderLoader
      book={{ id: item.id, title: item.title, mime: item.mime, size: item.size }}
      progress={progress ? { position: progress.position, percent: progress.percent, updatedAt: progress.updatedAt.getTime() } : null}
      sourceUrl={sourceUrl}
    />
  );
}
