import crypto from "crypto";
import prisma from "../lib/prisma";
import { hashToken } from "../utils/token";
import { createActivityLog } from "./activity.service";

export async function createInvite(
  workspaceId: string,
  email: string,
  role: "ADMIN" | "MEMBER" | "VIEWER"
) {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (user) {
    const existingMembership = await prisma.membership.findUnique({
      where: {
        userId_workspaceId: {
          userId: user.id,
          workspaceId,
        },
      },
    });

    if (existingMembership) {
      throw new Error("User is already a member of this workspace");
    }
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48);

  const invite = await prisma.invite.create({
    data: {
      workspaceId,
      email: normalizedEmail,
      role,
      tokenHash,
      expiresAt,
    },
  });

  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
    token: rawToken,
  };
}
export async function acceptInvite(
  token: string,
  userId: string
) {
  const tokenHash = hashToken(token);

  const invite = await prisma.invite.findUnique({
    where: {
      tokenHash,
    },
  });

  if (!invite) {
    throw new Error("Invalid invite");
  }

  if (invite.acceptedAt) {
    throw new Error("Invite has already been accepted");
  }

  if (invite.expiresAt < new Date()) {
    throw new Error("Invite has expired");
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
    throw new Error("This invite is for a different email address");
  }

  const existingMembership = await prisma.membership.findUnique({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId: invite.workspaceId,
      },
    },
  });

  if (existingMembership) {
    throw new Error("User is already a member of this workspace");
  }

  const membership = await prisma.$transaction(async (tx) => {
    const newMembership = await tx.membership.create({
      data: {
        userId,
        workspaceId: invite.workspaceId,
        role: invite.role,
      },
    });

    await tx.invite.update({
      where: {
        id: invite.id,
      },
      data: {
        acceptedAt: new Date(),
      },
    });

    await tx.activityLog.create({
      data: {
        workspaceId: invite.workspaceId,
        userId,
        action: "INVITE_ACCEPTED",
        entityType: "INVITE",
        entityId: invite.id,
      },
    });

    return newMembership;
  });

  return membership;
}