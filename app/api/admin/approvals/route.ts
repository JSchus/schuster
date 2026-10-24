import { HttpError, handle, parseJson, requireAdmin } from "@/lib/api";
import { findUserByEmail } from "@/lib/auth/roles";
import { approveEmail, removeApproval } from "@/lib/db/people";
import { approvalSchema, removeApprovalSchema } from "@/lib/sharing/protocol";

export const maxDuration = 10;

/** Let an email sign up directly (no link needed): they just sign in at /login. */
export const POST = handle(async (req: Request) => {
  const admin = await requireAdmin();
  const { email, role } = await parseJson(req, approvalSchema);
  if (await findUserByEmail(email)) throw new HttpError(409, "That person already has an account.");
  await approveEmail(email, role, { addedBy: admin.id });
  return Response.json({ email, role }, { status: 201 });
});

/** Withdraw an approval that hasn't been used yet. */
export const DELETE = handle(async (req: Request) => {
  await requireAdmin();
  const { email } = await parseJson(req, removeApprovalSchema);
  await removeApproval(email);
  return new Response(null, { status: 204 });
});
