import type { Metadata } from "next";
import { UploadQueue } from "@/components/upload/upload-queue";

export const metadata: Metadata = { title: "Upload" };

/**
 * Upload page. Files go browser → S3 directly (presigned multipart); EPUB
 * metadata/covers and video posters are extracted locally first.
 */
export default function UploadPage() {
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload</h1>
        <p className="text-sm text-muted-foreground">
          Covers, titles and authors are read from your files automatically.
        </p>
      </div>
      <UploadQueue />
    </div>
  );
}
