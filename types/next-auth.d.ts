import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/permissions";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: Role;
    /** When the role was last read from the database (ms). */
    roleAt?: number;
  }
}
