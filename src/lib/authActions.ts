"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { row } from "@/lib/db";
import { SESSION_COOKIE, sessionCookie, signSession } from "@/lib/session";

type SignInResult = { ok: true } | { ok: false; error: string };

/** Check an email and password against `users`; on success, start a session. */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  const address = String(email ?? "").trim().toLowerCase();
  if (!address || !password) return { ok: false, error: "Enter your email and password." };

  const user = await row<{ id: string; email: string; password_hash: string }>(
    "SELECT id, email, password_hash FROM users WHERE lower(email) = ?",
    [address],
  );
  // The same answer for a wrong email and a wrong password.
  const valid = !!user && (await bcrypt.compare(String(password), user.password_hash));
  if (!user || !valid) return { ok: false, error: "That email and password don't match." };

  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession({ userId: user.id, email: user.email }), sessionCookie);
  return { ok: true };
}
