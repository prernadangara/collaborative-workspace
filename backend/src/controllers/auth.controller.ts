import prisma from "../lib/prisma";
import { hashToken } from "../utils/token";
import { Request, Response } from "express";
import { loginUser, refreshAccessToken, registerUser } from "../services/auth.service";
import { REFRESH_COOKIE, REFRESH_MAX_AGE_MS, refreshCookieOptions } from "../utils/cookies";

export async function register(req: Request, res: Response) {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Name, email and password are required",
            });
        }

        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({ message: "Invalid input" });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ message: "Invalid email address" });
        }

        if (password.length < 8 || password.length > 128) {
            return res.status(400).json({
                message: "Password must be between 8 and 128 characters",
            });
        }

        const user = await registerUser(name, email, password);

        return res.status(201).json({
            message: "User registered successfully",
            user,
        });
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === "Email already registered"
        ) {
            return res.status(409).json({
                message: error.message,
            });
        }

        return res.status(500).json({
            message: "Something went wrong",
        });
    }
}

export async function login(req: Request, res: Response) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required",
            });
        }

        const user = await loginUser(email, password);

        res.cookie(REFRESH_COOKIE, user.refreshToken, {
            ...refreshCookieOptions(),
            maxAge: REFRESH_MAX_AGE_MS,
        });

        return res.status(200).json({
            message: "Login successful",
            user: user.user,
            accessToken: user.accessToken,
        });
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === "Invalid email or password"
        ) {
            return res.status(401).json({
                message: error.message,
            });
        }

        return res.status(500).json({
            message: "Something went wrong",
        });
    }
}
export async function refresh(req: Request, res: Response) {
    try {
        const refreshToken = req.cookies?.[REFRESH_COOKIE];

        if (!refreshToken) {
            return res.status(401).json({
                message: "Refresh token missing",
            });
        }

        const result = await refreshAccessToken(refreshToken);

        res.cookie(REFRESH_COOKIE, result.refreshToken, {
            ...refreshCookieOptions(),
            maxAge: REFRESH_MAX_AGE_MS,
        });

        return res.status(200).json({
            accessToken: result.accessToken,
        });
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === "Invalid or expired refresh token"
        ) {
            return res.status(401).json({
                message: error.message,
            });
        }

        return res.status(500).json({
            message: "Something went wrong",
        });
    }
}
export async function logout(req: Request, res: Response) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];

  if (refreshToken) {
   try {
    const tokenHash = hashToken(refreshToken);

    await prisma.refreshToken.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
   } catch (error) {
     console.error("logout: could not revoke token", (error as Error).message);
   }
  }

  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());

  return res.status(200).json({
    message: "Logged out successfully",
  });
}