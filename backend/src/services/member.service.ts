  import prisma from "../lib/prisma";

  export async function getWorkspaceMembers(workspaceId: string) {
    return prisma.membership.findMany({
      where: {
        workspaceId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  }
  export async function updateMemberRole(
    workspaceId: string,
    userId: string,
    role: "ADMIN" | "MEMBER" | "VIEWER"
  ) {
    const membership = await prisma.membership.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    if (!membership) {
      throw new Error("Member not found");
    }

    if (membership.role === "OWNER") {
      throw new Error("Owner role cannot be changed");
    }

    return prisma.membership.update({
      where: {
        id: membership.id,
      },
      data: {
        role,
      },
    });
  }
  export async function removeMember(
    workspaceId: string,
    userId: string
  ) {
    const membership = await prisma.membership.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    if (!membership) {
      throw new Error("Member not found");
    }

    if (membership.role === "OWNER") {
      throw new Error("Owner cannot be removed from the workspace");
    }

    return prisma.membership.delete({
      where: {
        id: membership.id,
      },
    });
  }