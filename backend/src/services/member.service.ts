import prisma from "../lib/prisma";
import { createActivityLog } from "./activity.service";
import { canManageMember, type Role } from "../utils/permissions";
import { evictUserFromWorkspace } from "../socket-events";

export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}

export async function getWorkspaceMembers(workspaceId: string) {
  return prisma.membership.findMany({
    where: { workspaceId },
    include: {
      user: {
        select: { id: true, name: true, email: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

async function findTarget(workspaceId: string, userId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (!membership) throw new NotFoundError("Member not found");
  return membership;
}

export async function updateMemberRole(
  workspaceId: string,
  targetUserId: string,
  role: "ADMIN" | "MEMBER" | "VIEWER",
  actor: { userId: string; role: Role }
) {
  const membership = await findTarget(workspaceId, targetUserId);

  if (
    !canManageMember(
      actor.role,
      membership.role,
      actor.userId,
      targetUserId,
      role
    )
  ) {
    throw new ForbiddenError("You cannot change this member's role");
  }

  const updated = await prisma.membership.update({
    where: { id: membership.id },
    data: { role },
  });

  await createActivityLog(
    workspaceId,
    actor.userId,
    "ROLE_CHANGED",
    "MEMBERSHIP",
    membership.id,
    { targetUserId, from: membership.role, to: role }
  );

  return updated;
}

export async function removeMember(
  workspaceId: string,
  targetUserId: string,
  actor: { userId: string; role: Role }
) {
  const membership = await findTarget(workspaceId, targetUserId);

  if (
    !canManageMember(actor.role, membership.role, actor.userId, targetUserId)
  ) {
    throw new ForbiddenError("You cannot remove this member");
  }

  // Unassign their tasks in this workspace so nothing points at a non-member.
  await prisma.$transaction([
    prisma.task.updateMany({
      where: {
        assigneeId: targetUserId,
        list: { board: { workspaceId } },
      },
      data: { assigneeId: null, version: { increment: 1 } },
    }),
    prisma.membership.delete({ where: { id: membership.id } }),
  ]);

  await createActivityLog(
    workspaceId,
    actor.userId,
    "MEMBER_REMOVED",
    "MEMBERSHIP",
    membership.id,
    { targetUserId, role: membership.role }
  );

  await evictUserFromWorkspace(targetUserId, workspaceId);

  return membership;
}
