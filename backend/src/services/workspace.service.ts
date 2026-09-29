import prisma from "../lib/prisma";
import { createActivityLog } from "./activity.service";

export async function createWorkspace(
    userId: string,
    name: string
) {
    return prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({
            data: {
                name: name.trim(),
            },
        });

        await tx.membership.create({
            data: {
                userId,
                workspaceId: workspace.id,
                role: "OWNER",
            },
        });

        await tx.activityLog.create({
            data: {
                workspaceId: workspace.id,
                userId,
                action: "WORKSPACE_CREATED",
                entityType: "WORKSPACE",
                entityId: workspace.id,
            },
        });

        return workspace;
    });
}

export async function getUserWorkspaces(userId: string) {
    return prisma.workspace.findMany({
        where: {
            memberships: {
                some: {
                    userId,
                },
            },
        },
        include: {
            memberships: {
                where: {
                    userId,
                },
                select: {
                    role: true,
                },
            },
        },
        orderBy: {
            createdAt: "desc",
        },
    });
}