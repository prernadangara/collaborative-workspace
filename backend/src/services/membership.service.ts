import prisma from "../lib/prisma";

export async function getMembership(
  userId: string,
  workspaceId: string
) {
  return prisma.membership.findUnique({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId,
      },
    },
  });
}