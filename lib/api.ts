import "server-only";
import { z } from "zod";
import { auth } from "@/auth";
import { canContribute } from "@/lib/permissions";

/** Thrown inside route handlers to short-circuit with an HTTP error. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The signed-in user, or a 401. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new HttpError(401, "Unauthorized");
  return session.user;
}

/** A signed-in admin or member (viewers can't upload, share or make shelves), or a 403. */
export async function requireContributor() {
  const user = await requireUser();
  if (!canContribute(user)) throw new HttpError(403, "Viewers can't do that. Ask the admin to make you a member.");
  return user;
}

/** A signed-in admin, or a 403. */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new HttpError(403, "Admins only");
  return user;
}

export async function parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  const body = await req.json().catch(() => {
    throw new HttpError(400, "Invalid JSON");
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, z.prettifyError(parsed.error));
  return parsed.data;
}

const uuid = z.string().uuid();

/** Validate a route `[id]` param as a UUID (404 otherwise). */
export function parseId(id: string): string {
  if (!uuid.safeParse(id).success) throw new HttpError(404, "Not found");
  return id;
}

/** Wrap a handler so HttpErrors become JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      console.error(err);
      return Response.json({ error: "Internal error" }, { status: 500 });
    }
  };
}
