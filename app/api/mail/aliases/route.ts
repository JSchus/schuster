import { HttpError, handle, parseJson, requireContributor } from "@/lib/api";
import { createAlias, listAliases } from "@/lib/db/mail";
import { listPeople } from "@/lib/db/people";
import { env } from "@/lib/env";
import { aliasJson } from "@/lib/mail/alias-json";
import { localProblem, normalizeLocal, randomLocal } from "@/lib/mail/aliases";
import { aliasCreateSchema } from "@/lib/sharing/protocol";

export const maxDuration = 10;

/** Your aliases, and group aliases you're in. */
export const GET = handle(async () => {
  const user = await requireContributor();
  const domain = env().MAIL_DOMAIN;
  return Response.json((await listAliases(user.id)).map((a) => aliasJson(a, domain, user.id)));
});

/** Make an alias (members and admins). */
export const POST = handle(async (req: Request) => {
  const user = await requireContributor();
  const body = await parseJson(req, aliasCreateSchema);
  const known = new Set((await listPeople()).map((p) => p.id));
  const memberIds = [...new Set(body.memberIds ?? [])].filter((id) => known.has(id) && id !== user.id);
  const values = {
    ownerId: user.id,
    label: body.label || null,
    kind: memberIds.length ? ("group" as const) : ("personal" as const),
    memberIds,
    expiresAt: body.days ? new Date(Date.now() + body.days * 86_400_000) : null,
  };
  const domain = env().MAIL_DOMAIN;

  if (body.name?.trim()) {
    const localPart = normalizeLocal(body.name);
    const problem = localProblem(localPart);
    if (problem) throw new HttpError(400, problem);
    const alias = await createAlias({ ...values, localPart });
    if (!alias) throw new HttpError(409, `${localPart}@${domain} is already taken. Try another name.`);
    return Response.json(aliasJson(alias, domain, user.id), { status: 201 });
  }
  for (let i = 0; i < 6; i++) {
    const alias = await createAlias({ ...values, localPart: randomLocal() });
    if (alias) return Response.json(aliasJson(alias, domain, user.id), { status: 201 });
  }
  throw new HttpError(500, "Couldn't pick a free name; please try again.");
});
