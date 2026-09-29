import prisma from "../lib/prisma";

export async function createActivityLog(
    workspaceId: string,
    userId: string,
    action: string,
    entityType: string,
    entityId?: string,
    metadata?: import("../generated/prisma/client").Prisma.InputJsonValue
) {
    return prisma.activityLog.create({
        data: {
            workspaceId,
            userId,
            action,
            entityType,
            ...(entityId !== undefined && {
                entityId,
            }),
            ...(metadata !== undefined && {
                metadata,
            }),
        },
    });
}

export async function getWorkspaceActivityLogs(
    workspaceId: string,
    page: number,
    limit: number
) {
    const skip = (page - 1) * limit;

    const [logs, total] = await prisma.$transaction([
        prisma.activityLog.findMany({
            where: {
                workspaceId,
            },
            orderBy: {
                createdAt: "desc",
            },
            skip,
            take: limit,
        }),
        prisma.activityLog.count({
            where: {
                workspaceId,
            },
        }),
    ]);

    return {
        logs,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}