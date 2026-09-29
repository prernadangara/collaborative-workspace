import crypto from "crypto";
import prisma from "../lib/prisma";
import { hashToken } from "../utils/token";
import { createActivityLog } from "./activity.service";
import { enqueue } from "../queues/task.queue";
import { sendMail } from "../lib/mailer";
import { canInviteAs, type Role } from "../utils/permissions";
import { ForbiddenError } from "./member.service";

export async function createInvite(
  workspaceId: string,
  email: string,
  role: "ADMIN" | "MEMBER" | "VIEWER",
  actor: { userId: string; role: Role }
) {
  if (!canInviteAs(actor.role, role)) {
    throw new ForbiddenError("You cannot invite someone with that role");
  }

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

  const [workspace, inviter] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId } }),
    prisma.user.findUnique({ where: { id: actor.userId } }),
  ]);

  await createActivityLog(
    workspaceId,
    actor.userId,
    "INVITE_CREATED",
    "INVITE",
    invite.id,
    { email: normalizedEmail, role }
  );

  // Email delivery happens in the background worker, not in this request.
  const job = {
    inviteId: invite.id,
    email: normalizedEmail,
    workspaceName: workspace?.name ?? "a workspace",
    inviterName: inviter?.name ?? "A teammate",
    role,
    token: rawToken,
  };

  const queued = await enqueue("invite-email", job);

  if (!queued) {
    // Queue unavailable: degrade to sending inline rather than dropping the email.
    await sendMail(
      job.email,
      `${job.inviterName} invited you to ${job.workspaceName}`,
      `You were invited as ${job.role}. Invite token: ${job.token}`
    ).catch((error) =>
      console.error("[invite] inline email failed:", (error as Error).message)
    );
  }

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