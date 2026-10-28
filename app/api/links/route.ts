import { HttpError, handle, parseJson, requireContributor } from "@/lib/api";
import { createLink, listLinks } from "@/lib/db/links";
import { linkJson } from "@/lib/links/link-json";
import { isValidSlug, normalizeSlug, randomSlug, validateTarget } from "@/lib/links/rules";
import { linkCreateSchema } from "@/lib/sharing/protocol";
import { hashPassword } from "@/lib/sharing/tokens";

export const maxDuration = 10;

/** Your short links (admins: everyone's). */
export const GET = handle(async () => {
  const user = await requireContributor();
  return Response.json((await listLinks(user)).map((l) => linkJson(l, user.id)));
});

/** Make a short link. Members and admins. */
export const POST = handle(async (req: Request) => {
  const user = await requireContributor();
  const body = await parseJson(req, linkCreateSchema);
  const target = validateTarget(body.target, new URL(req.url).hostname);
  if ("error" in target) throw new HttpError(400, target.error);

  const values = {
    targetUrl: target.url,
    ownerId: user.id,
    note: body.note || null,
    passwordHash: body.password ? await hashPassword(body.password) : null,
    expiresAt: body.expiresAt
      ? new Date(body.expiresAt)
      : body.days
        ? new Date(Date.now() + body.days * 86_400_000)
        : null,
  };

  if (body.slug?.trim()) {
    const slug = normalizeSlug(body.slug);
    if (!isValidSlug(slug)) throw new HttpError(400, "Use 2–64 letters, numbers or dashes.");
    const link = await createLink({ ...values, slug });
    if (!link) throw new HttpError(409, `“${slug}” is already taken. Try another word.`);
    return Response.json(linkJson(link, user.id), { status: 201 });
  }
  // Random word: retry on the (rare) clash.
  for (let i = 0; i < 5; i++) {
    const link = await createLink({ ...values, slug: randomSlug(6 + Math.floor(i / 2)) });
    if (link) return Response.json(linkJson(link, user.id), { status: 201 });
  }
  throw new HttpError(500, "Couldn't pick a free word; please try again.");
});
