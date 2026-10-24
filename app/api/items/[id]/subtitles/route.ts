import { z } from "zod";
import { HttpError, handle, parseId, parseJson, requireUser } from "@/lib/api";
import { getItemForEdit, setSubtitles } from "@/lib/db/queries";
import { normalizeLang } from "@/lib/player/subtitles";
import { getStorage, isSubtitleKeyFor, subtitleKey } from "@/lib/storage";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

const lang = z.string().transform((v, ctx) => {
  const code = normalizeLang(v);
  if (!code) ctx.addIssue({ code: "custom", message: "Invalid language code" });
  return code ?? "";
});
const label = z.string().trim().min(1).max(40);

/** The video, if this user may edit it (uploader or admin). */
async function editableVideo(id: string) {
  const user = await requireUser();
  const item = await getItemForEdit(parseId(id), user);
  if (!item || item.type !== "video") throw new HttpError(404, "Not found");
  return item;
}

export type SubtitleStartResponse = { key: string; uploadUrl: string };

/** Start adding a subtitle track: a presigned PUT for a versioned .vtt key. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const item = await editableVideo((await params).id);
  const body = await parseJson(req, z.object({ lang, label }));
  const key = subtitleKey(item.id, body.lang, Date.now());
  const uploadUrl = await getStorage().presignPut(key, { contentType: "text/vtt", expiresIn: 600 });
  return Response.json({ key, uploadUrl } satisfies SubtitleStartResponse);
});

/** Confirm an uploaded track. Re-adding a language replaces (and deletes) the old file. */
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const item = await editableVideo((await params).id);
  const body = await parseJson(req, z.object({ key: z.string().max(200), lang, label }));
  if (!isSubtitleKeyFor(item.id, body.key) || !body.key.startsWith(`subs/${item.id}/${body.lang}-`)) {
    throw new HttpError(400, "Invalid subtitle key");
  }
  const storage = getStorage();
  if (!(await storage.head(body.key))) throw new HttpError(409, "Subtitle file was not uploaded");

  const current = item.metadata.subtitles ?? [];
  const replaced = current.filter((t) => t.lang === body.lang && t.key !== body.key);
  const next = [...current.filter((t) => t.lang !== body.lang), { lang: body.lang, label: body.label, key: body.key }];
  await setSubtitles(item.id, next);
  await Promise.all(replaced.map((t) => storage.delete(t.key).catch(() => undefined)));
  return Response.json({ subtitles: next });
});

/** Remove a language's track and its file. */
export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const item = await editableVideo((await params).id);
  const body = await parseJson(req, z.object({ lang }));
  const current = item.metadata.subtitles ?? [];
  const gone = current.filter((t) => t.lang === body.lang);
  if (!gone.length) throw new HttpError(404, "No such subtitle track");
  const next = current.filter((t) => t.lang !== body.lang);
  await setSubtitles(item.id, next);
  await Promise.all(gone.map((t) => getStorage().delete(t.key).catch(() => undefined)));
  return Response.json({ subtitles: next });
});
