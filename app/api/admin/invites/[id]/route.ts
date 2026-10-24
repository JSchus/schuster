import { handle, parseId, requireAdmin } from "@/lib/api";
import { revokeInvite } from "@/lib/db/people";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

/** Turn an invite link off. Emails already approved through it stay approved. */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await requireAdmin();
  await revokeInvite(parseId((await params).id));
  return new Response(null, { status: 204 });
});
