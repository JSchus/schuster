import { HttpError, handle, parseId, requireContributor } from "@/lib/api";
import { deleteReplyAddress } from "@/lib/db/mail";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireContributor();
  if (!(await deleteReplyAddress(user.id, parseId((await params).id)))) throw new HttpError(404, "Not found");
  return new Response(null, { status: 204 });
});
