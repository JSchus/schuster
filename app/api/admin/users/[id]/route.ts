import { HttpError, handle, parseId, parseJson, requireAdmin } from "@/lib/api";
import { deleteUser, setUserRole } from "@/lib/db/people";
import { roleSchema } from "@/lib/sharing/protocol";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

/** Change someone's role. Takes effect within a few minutes (see auth.ts). */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  await requireAdmin();
  const id = parseId((await params).id);
  const { role } = await parseJson(req, roleSchema);
  if (!(await setUserRole(id, role))) throw new HttpError(409, "There must always be at least one admin.");
  return Response.json({ role });
});

/** Remove an account. Their uploads stay in the library. */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const id = parseId((await params).id);
  if (id === admin.id) throw new HttpError(400, "You can't remove yourself.");
  if (!(await deleteUser(id))) throw new HttpError(409, "There must always be at least one admin.");
  return new Response(null, { status: 204 });
});
