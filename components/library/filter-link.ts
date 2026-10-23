export type LibraryParams = { type?: string; q?: string; tag?: string };

/** Build a library URL from params, dropping empty values. */
export function libraryHref(params: LibraryParams): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `/?${s}` : "/";
}
