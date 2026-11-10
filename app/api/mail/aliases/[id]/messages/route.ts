import { HttpError, handle, parseId, requireContributor } from "@/lib/api";
import { getVisibleAlias, listLog } from "@/lib/db/mail";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

export type MailLogJson = {
  id: string;
  direction: "in" | "out";
  from: string;
  to: string;
  subject: string | null;
  outcome: string;
  at: number;
  /** The stored copy can still be opened (14 days). */
  viewable: boolean;
};

/** The last 14 days of mail through an alias (owner or group members). */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireContributor();
  const alias = await getVisibleAlias(user.id, parseId((await params).id));
  if (!alias) throw new HttpError(404, "Not found");
  const rows = await listLog(alias.id);
  const body: MailLogJson[] = rows.map((r) => ({
    id: r.id,
    direction: r.direction === "out" ? "out" : "in",
    from: r.fromAddr,
    to: r.toAddr,
    subject: r.subject,
    outcome: r.outcome,
    at: r.createdAt.getTime(),
    viewable: !!r.s3Key,
  }));
  return Response.json(body);
});
