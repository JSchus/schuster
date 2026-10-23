import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SiteHeader } from "@/components/site-header";

/** Shell for signed-in pages. Middleware already gates; this is defence in depth. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <>
      <SiteHeader user={session.user} />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </>
  );
}
