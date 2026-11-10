import { HttpError, handle, parseId, parseJson, requireContributor } from "@/lib/api";
import { deleteAlias, getVisibleAlias, updateAlias } from "@/lib/db/mail";
import { listPeople } from "@/lib/db/people";
import { aliasPatchSchema } from "@/lib/sharing/protocol";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

/** Only the alias's owner may change or delete it (group members can just read it). */
async function owned(params: Ctx["params"]) {
  const user = await requireContributor();
  const alias = await getVisibleAlias(user.id, parseId((await params).id));
  if (!alias || alias.ownerId !== user.id) throw new HttpError(404, "Not found");
  return alias;
}

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const alias = await owned(params);
  const body = await parseJson(req, aliasPatchSchema);
  let memberIds: string[] | undefined;
  if (body.memberIds) {
    const known = new Set((await listPeople()).map((p) => p.id));
    memberIds = [...new Set(body.memberIds)].filter((id) => known.has(id) && id !== alias.ownerId);
  }
  await updateAlias(alias.id, {
    ...(body.label !== undefined ? { label: body.label || null } : {}),
    ...(body.active !== undefined ? { active: body.active } : {}),
    ...(memberIds ? { memberIds } : {}),
    ...(body.unpause ? { pausedReason: null } : {}),
  });
  return Response.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const alias = await owned(params);
  await deleteAlias(alias.id);
  return new Response(null, { status: 204 });
});
