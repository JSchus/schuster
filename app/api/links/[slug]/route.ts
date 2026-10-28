import { HttpError, handle, parseJson, requireContributor } from "@/lib/api";
import { deleteLink, getLink, updateLink } from "@/lib/db/links";
import { isValidSlug, validateTarget } from "@/lib/links/rules";
import { canEdit } from "@/lib/permissions";
import { linkPatchSchema } from "@/lib/sharing/protocol";

export const maxDuration = 10;

type Ctx = { params: Promise<{ slug: string }> };

/** A link the caller may change (its owner or an admin), or a 404. */
async function editable(params: Ctx["params"]) {
  const user = await requireContributor();
  const { slug } = await params;
  const link = isValidSlug(slug) ? await getLink(slug) : undefined;
  if (!link || !canEdit(user, link.ownerId)) throw new HttpError(404, "Not found");
  return link;
}

/** Change where it goes, its note, or turn it off/on. */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const link = await editable(params);
  const body = await parseJson(req, linkPatchSchema);
  let targetUrl: string | undefined;
  if (body.target !== undefined) {
    const t = validateTarget(body.target, new URL(req.url).hostname);
    if ("error" in t) throw new HttpError(400, t.error);
    targetUrl = t.url;
  }
  await updateLink(link.slug, {
    ...(targetUrl ? { targetUrl } : {}),
    ...(body.note !== undefined ? { note: body.note || null } : {}),
    ...(body.disabled !== undefined ? { disabledAt: body.disabled ? new Date() : null } : {}),
  });
  return Response.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const link = await editable(params);
  await deleteLink(link.slug);
  return new Response(null, { status: 204 });
});
