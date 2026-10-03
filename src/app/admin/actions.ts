"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminCookieValue, cookieIsValid, tokenMatches } from "@/lib/adminAuth";
import { parseCookiesTxt } from "@/lib/cookiesTxt";
import { removeYoutubeCookies, saveYoutubeCookies, storeConfigured } from "@/lib/telemetry";

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

async function requireAdmin() {
  // Actions can be called without the page, so each one checks for itself.
  if (!cookieIsValid((await cookies()).get(ADMIN_COOKIE)?.value)) redirect("/admin");
}

export async function uploadYoutubeCookies(formData: FormData) {
  await requireAdmin();
  if (!storeConfigured()) redirect("/admin?cookies=no_store#youtube");
  const file = formData.get("cookies");
  const parsed = parseCookiesTxt(file instanceof File ? await file.text() : "");
  if (!parsed.ok) redirect(`/admin?cookies=${parsed.error}#youtube`);
  await saveYoutubeCookies(parsed.text);
  redirect("/admin?cookies=saved#youtube");
}

export async function deleteYoutubeCookies() {
  await requireAdmin();
  await removeYoutubeCookies();
  redirect("/admin?cookies=removed#youtube");
}
