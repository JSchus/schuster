import { HttpError, handle, parseJson } from "@/lib/api";
import { findUserByEmail } from "@/lib/auth/roles";
import { approveEmail, consumeInvite, isApproved, usableInvite } from "@/lib/db/people";
import { redeemSchema } from "@/lib/sharing/protocol";
import { isTokenShape } from "@/lib/sharing/tokens";

export const maxDuration = 10;

type Ctx = { params: Promise<{ token: string }> };

const GONE = "This invite link has expired or has been used up. Ask for a new one.";

export type RedeemResponse = { email: string; status: "approved" | "existing" };

/**
 * Public: accept an invite for an email. Uses one of the link's uses and
 * approves the email, so its owner can then create a passkey or get a
 * sign-in link like anyone else. An email that already has an account or
 * approval doesn't use up the link.
 */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { token } = await params;
  if (!isTokenShape(token)) throw new HttpError(404, "This invite link isn't valid.");
  const { email } = await parseJson(req, redeemSchema);
  // Check the link first, so a bad link can't be used to ask who has an account.
  if (!(await usableInvite(token))) throw new HttpError(410, GONE);

  if (await findUserByEmail(email)) return Response.json({ email, status: "existing" } satisfies RedeemResponse);
  if (await isApproved(email)) return Response.json({ email, status: "approved" } satisfies RedeemResponse);

  const invite = await consumeInvite(token);
  if (!invite) throw new HttpError(410, GONE);
  await approveEmail(email, invite.role, { inviteId: invite.id });
  return Response.json({ email, status: "approved" } satisfies RedeemResponse);
});
