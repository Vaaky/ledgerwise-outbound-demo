import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role, User } from "./types";

const USERS: Record<Role, User> = {
  sales: { id: "u_sales", name: "Maya Chen", email: "maya@ledgerwise.demo", role: "sales" },
  admin: { id: "u_admin", name: "Sam Okafor", email: "sam@unscale.demo", role: "admin" },
};

export async function getUser(): Promise<User | null> {
  const jar = await cookies();
  const role = jar.get("lw_user")?.value as Role | undefined;
  if (!role || !USERS[role]) return null;
  return USERS[role];
}

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/today");
  return user;
}
