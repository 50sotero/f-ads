"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminCookieValue, tokenMatches } from "@/lib/adminAuth";

export async function signIn(formData: FormData) {
  const value = adminCookieValue();
  if (!value || !tokenMatches(String(formData.get("token") ?? ""))) redirect("/admin?error=1");
  (await cookies()).set(ADMIN_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86400,
  });
  redirect("/admin");
}

export async function signOut() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin");
}
