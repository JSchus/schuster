import { handle, parseJson, requireAdmin } from "@/lib/api";
import { createInvite } from "@/lib/db/people";
import { inviteCreateSchema } from "@/lib/sharing/protocol";
import { randomToken } from "@/lib/sharing/tokens";

export const maxDuration = 10;

/** Create an invite link. */
export const POST = handle(async (req: Request) => {
  const admin = await requireAdmin();
  const body = await parseJson(req, inviteCreateSchema);
  const invite = await createInvite({
    token: randomToken(),
    role: body.role,
    note: body.note || undefined,
    createdBy: admin.id,
    expiresAt: new Date(Date.now() + body.days * 86_400_000),
    maxUses: body.maxUses,
  });
  return Response.json({ id: invite.id, token: invite.token }, { status: 201 });
});
