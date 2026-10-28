import { handle, parseJson, requireUser } from "@/lib/api";
import { cleanBirthday } from "@/lib/contacts/vcard";
import { getProfile, upsertProfile } from "@/lib/db/contacts";
import { profileSchema } from "@/lib/sharing/protocol";

export const maxDuration = 10;

/** Your own family-directory entry (null until you save one). */
export const GET = handle(async () => {
  const user = await requireUser();
  return Response.json((await getProfile(user.id)) ?? null);
});

/** Save your entry; `listed` decides whether the family sees it. */
export const PUT = handle(async (req: Request) => {
  const user = await requireUser();
  const body = await parseJson(req, profileSchema);
  await upsertProfile(user.id, {
    displayName: body.displayName || null,
    phone: body.phone || null,
    birthday: body.birthday ? cleanBirthday(body.birthday) : null,
    address: body.address || null,
    note: body.note || null,
    listed: body.listed,
  });
  return Response.json({ ok: true });
});
