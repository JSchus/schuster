import type { Metadata } from "next";
import { auth } from "@/auth";
import { UploadQueue } from "@/components/upload/upload-queue";
import { canContribute } from "@/lib/permissions";

export const metadata: Metadata = { title: "Upload" };

/**
 * Upload page. Files go browser → S3 directly (presigned multipart); EPUB
 * metadata/covers and video posters are extracted locally first.
 */
export default async function UploadPage() {
  if (!canContribute((await auth())?.user)) {
    return (
      <p className="mx-auto max-w-md rounded-xl border border-dashed p-12 text-center text-muted-foreground">
        Your account can read, watch and play, but not upload. Ask the admin if you&apos;d like to add things.
      </p>
    );
  }
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload</h1>
        <p className="text-sm text-muted-foreground">
          Covers, titles and authors are read from your files automatically. Everyone can see new uploads; use
          Edit on an item to limit who can.
        </p>
      </div>
      <UploadQueue />
    </div>
  );
}
