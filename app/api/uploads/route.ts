import { randomUUID } from "node:crypto";
import { HttpError, handle, parseJson, requireUser } from "@/lib/api";
import { createPendingItem } from "@/lib/db/queries";
import { getStorage, mediaKey } from "@/lib/storage";
import { planParts } from "@/lib/upload/plan";
import { initRequestSchema, type InitResponse } from "@/lib/upload/protocol";

export const maxDuration = 10;

/** Start an upload: create a pending item and an S3 multipart upload. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = await parseJson(req, initRequestSchema);

  let plan;
  try {
    plan = planParts(body.size);
  } catch (err) {
    throw new HttpError(413, (err as Error).message);
  }

  const id = randomUUID();
  const fileKey = mediaKey(id, body.filename);
  const { uploadId } = await getStorage().createMultipartUpload(fileKey, {
    contentType: body.mime,
  });

  await createPendingItem({
    id,
    type: body.type,
    title: body.title,
    description: body.description,
    fileKey,
    uploadId,
    size: body.size,
    mime: body.mime,
    tags: body.tags,
    metadata: { ...body.metadata, originalFilename: body.filename },
    addedBy: user.id,
  });

  return Response.json({ itemId: id, ...plan } satisfies InitResponse, { status: 201 });
});
