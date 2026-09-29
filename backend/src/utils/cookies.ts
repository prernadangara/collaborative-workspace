import type { CookieOptions } from "express";

/**
 * One definition used by login, refresh and logout so the cookie attributes
 * always match (a mismatch makes browsers ignore the clear/overwrite).
 *
 * Local / docker:      COOKIE_SECURE=false COOKIE_SAMESITE=lax   (defaults)
 * Vercel -> Render:    COOKIE_SECURE=true  COOKIE_SAMESITE=none
 */
export const REFRESH_COOKIE = "refreshToken";

export function refreshCookieOptions(): CookieOptions {
  const sameSite = (process.env.COOKIE_SAMESITE || "lax") as
    | "lax"
    | "strict"
    | "none";
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true" || sameSite === "none",
    sameSite,
    path: "/api/auth",
  };
}

export const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
