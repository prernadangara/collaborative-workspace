import { signAccessToken, signRefreshToken } from "../utils/jwt";
import bcrypt from "bcrypt";
import prisma from "../lib/prisma";
import { hashToken } from "../utils/token";

export async function registerUser(
    name: string,
    email: string,
    password: string
) {
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
    });

    if (existingUser) {
        throw new Error("Email already registered");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
        data: {
            name: name.trim(),
            email: normalizedEmail,
            passwordHash,
        },
    });

    return {
        id: user.id,
        name: user.name,
        email: user.email,
    };
}

export async function loginUser(
    email: string,
    password: string
) {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
    });

    if (!user) {
        throw new Error("Invalid email or password");
    }

    const passwordMatches = await bcrypt.compare(
        password,
        user.passwordHash
    );

    if (!passwordMatches) {
        throw new Error("Invalid email or password");
    }

    const accessToken = signAccessToken(user.id);
    const refreshToken = signRefreshToken(user.id);

    await prisma.refreshToken.create({
        data: {
            tokenHash: hashToken(refreshToken),
            userId: user.id,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
    });

    return {
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
        },
        accessToken,
        refreshToken,
    };
}
export async function refreshAccessToken(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);

  const storedToken = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  if (!storedToken) {
    throw new Error("Invalid or expired refresh token");
  }

  // Reuse detection: a rotated (revoked) token being presented again means it
  // was probably stolen. Kill every session for that user.
  if (storedToken.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: storedToken.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new Error("Invalid or expired refresh token");
  }

  if (storedToken.expiresAt < new Date()) {
    throw new Error("Invalid or expired refresh token");
  }

  const newRefreshToken = signRefreshToken(storedToken.userId);
  const newAccessToken = signAccessToken(storedToken.userId);

  // Atomic rotation: only one concurrent request can flip revokedAt from null.
  await prisma.$transaction(async (tx) => {
    const revoked = await tx.refreshToken.updateMany({
      where: { id: storedToken.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (revoked.count !== 1) {
      throw new Error("Invalid or expired refresh token");
    }

    await tx.refreshToken.create({
      data: {
        tokenHash: hashToken(newRefreshToken),
        userId: storedToken.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}
