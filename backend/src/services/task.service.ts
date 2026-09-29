import prisma from "../lib/prisma";
import { cacheDel, boardCacheKey, summaryCacheKey } from "../lib/cache";
import { createActivityLog } from "./activity.service";
import { emitBoardEvent } from "../socket-events";

async function invalidate(workspaceId: string, boardId: string) {
    await cacheDel(boardCacheKey(workspaceId, boardId), summaryCacheKey(workspaceId));
}

export async function createTask(
    listId: string,
    workspaceId: string,
    title: string,
    description?: string,
    userId?: string
) {
    const list = await prisma.list.findFirst({
        where: {
            id: listId,
            board: {
                workspaceId,
            },
        },
    });

    if (!list) {
        throw new Error("List not found");
    }

    // Serialise concurrent creates in the same list: lock the parent row,
    // then compute the next position inside the same transaction.
    const task = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "List" WHERE id = ${listId} FOR UPDATE`;

        const lastTask = await tx.task.findFirst({
            where: { listId },
            orderBy: { position: "desc" },
        });

        return tx.task.create({
            data: {
                title: title.trim(),
                description: description?.trim() || null,
                listId,
                position: lastTask ? lastTask.position + 1 : 1,
            },
        });
    });

    await invalidate(workspaceId, list.boardId);

    if (userId) {
        await createActivityLog(
            workspaceId,
            userId,
            "TASK_CREATED",
            "TASK",
            task.id
        );
    }
    emitBoardEvent(
        list.boardId,
        "task-created",
        task
    );

    return task;
}

export async function updateTask(
    taskId: string,
    workspaceId: string,
    version: number,
    title?: string,
    description?: string,
    userId?: string,
    status?: "TODO" | "IN_PROGRESS" | "DONE"
) {
    const task = await prisma.task.findFirst({
        where: {
            id: taskId,
            list: {
                board: {
                    workspaceId,
                },
            },
        },
        include: {
            list: true,
        },
    });

    if (!task) {
        throw new Error("Task not found");
    }

    const result = await prisma.task.updateMany({
        where: {
            id: taskId,
            version,
        },
        data: {
            ...(title !== undefined && {
                title: title.trim(),
            }),
            ...(description !== undefined && {
                description: description.trim() || null,
            }),
            ...(status !== undefined && {
                status,
            }),
            version: {
                increment: 1,
            },
        },
    });

    if (result.count === 0) {
        throw new Error("Task version conflict");
    }

    const updatedTask = await prisma.task.findUnique({
        where: {
            id: taskId,
        },
    });

    await invalidate(workspaceId, task.list.boardId);

    if (userId) {
        await createActivityLog(
            workspaceId,
            userId,
            "TASK_UPDATED",
            "TASK",
            task.id
        );
    }
    emitBoardEvent(
        task.list.boardId,
        "task-updated",
        updatedTask
    );

    return updatedTask;
}

export async function deleteTask(
    taskId: string,
    workspaceId: string,
    userId?: string
) {
    const task = await prisma.task.findFirst({
        where: {
            id: taskId,
            list: {
                board: {
                    workspaceId,
                },
            },
        },
        include: {
            list: true,
        },
    });

    if (!task) {
        throw new Error("Task not found");
    }

    const deletedTask = await prisma.task.delete({
        where: {
            id: taskId,
        },
    });

    await invalidate(workspaceId, task.list.boardId);

    if (userId) {
        await createActivityLog(
            workspaceId,
            userId,
            "TASK_DELETED",
            "TASK",
            task.id
        );
    }
    emitBoardEvent(
        task.list.boardId,
        "task-deleted",
        { taskId: task.id }
    );

    return deletedTask;
}

export async function searchTasks(
    workspaceId: string,
    page: number,
    limit: number,
    search?: string,
    status?: "TODO" | "IN_PROGRESS" | "DONE",
    assigneeId?: string,
    labelId?: string
) {
    const skip = (page - 1) * limit;

    const where = {
        list: {
            board: {
                workspaceId,
            },
        },
        ...(status && {
            status,
        }),
        ...(assigneeId && {
            assigneeId,
        }),
        ...(labelId && {
            labels: {
                some: {
                    labelId,
                },
            },
        }),
        ...(search
            ? {
                OR: [
                    {
                        title: {
                            contains: search,
                            mode: "insensitive" as const,
                        },
                    },
                    {
                        description: {
                            contains: search,
                            mode: "insensitive" as const,
                        },
                    },
                ],
            }
            : {}),
    };

    const [tasks, total] = await prisma.$transaction([
        prisma.task.findMany({
            where,
            skip,
            take: limit,
            orderBy: {
                createdAt: "desc",
            },
        }),
        prisma.task.count({
            where,
        }),
    ]);

    return {
        tasks,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}
export async function moveTask(
    taskId: string,
    workspaceId: string,
    targetListId: string,
    targetPosition: number,
    userId?: string
) {
    const task = await prisma.task.findFirst({
        where: {
            id: taskId,
            list: {
                board: {
                    workspaceId,
                },
            },
        },
        include: {
            list: true,
        },
    });

    if (!task) {
        throw new Error("Task not found");
    }

    const targetList = await prisma.list.findFirst({
        where: {
            id: targetListId,
            board: {
                workspaceId,
            },
        },
    });

    if (!targetList) {
        throw new Error("Target list not found");
    }

    const updatedTask = await prisma.$transaction(async (tx) => {
        const lockIds = [...new Set([task.listId, targetListId])].sort();
        for (const id of lockIds) {
            await tx.$queryRaw`SELECT id FROM "List" WHERE id = ${id} FOR UPDATE`;
        }

        // Re-read under the lock: the position read above may be stale.
        const current = await tx.task.findUnique({ where: { id: taskId } });
        if (!current) {
            throw new Error("Task not found");
        }

        if (current.listId !== task.listId) {
            // Someone moved this task to another list while we were waiting.
            throw new Error("Task version conflict");
        }

        const oldListId = current.listId;
        task.position = current.position;

        if (oldListId === targetListId) {
            if (targetPosition < task.position) {
                await tx.task.updateMany({
                    where: {
                        listId: targetListId,
                        position: {
                            gte: targetPosition,
                            lt: task.position,
                        },
                        id: {
                            not: taskId,
                        },
                    },
                    data: {
                        position: {
                            increment: 1,
                        },
                    },
                });
            } else if (targetPosition > task.position) {
                await tx.task.updateMany({
                    where: {
                        listId: targetListId,
                        position: {
                            gt: task.position,
                            lte: targetPosition,
                        },
                        id: {
                            not: taskId,
                        },
                    },
                    data: {
                        position: {
                            decrement: 1,
                        },
                    },
                });
            }
        } else {
            await tx.task.updateMany({
                where: {
                    listId: oldListId,
                    position: {
                        gt: task.position,
                    },
                },
                data: {
                    position: {
                        decrement: 1,
                    },
                },
            });

            await tx.task.updateMany({
                where: {
                    listId: targetListId,
                    position: {
                        gte: targetPosition,
                    },
                },
                data: {
                    position: {
                        increment: 1,
                    },
                },
            });
        }

        return tx.task.update({
            where: {
                id: taskId,
            },
            data: {
                listId: targetListId,
                position: targetPosition,
                status:
                    targetList.name === "To Do"
                        ? "TODO"
                        : targetList.name === "In Progress"
                            ? "IN_PROGRESS"
                            : "DONE",
                version: {
                    increment: 1,
                },
            },
        });
    });

    await invalidate(workspaceId, task.list.boardId);

    if (userId) {
        await createActivityLog(
            workspaceId,
            userId,
            "TASK_MOVED",
            "TASK",
            task.id
        );
    }
    emitBoardEvent(
        task.list.boardId,
        "task-moved",
        updatedTask
    );

    return updatedTask;
}
export async function assignTask(
    taskId: string,
    workspaceId: string,
    assigneeId: string | null,
    userId?: string
) {
    const task = await prisma.task.findFirst({
        where: {
            id: taskId,
            list: {
                board: {
                    workspaceId,
                },
            },
        },
        include: {
            list: true,
        },
    });

    if (!task) {
        throw new Error("Task not found");
    }

    if (assigneeId) {
        const member = await prisma.membership.findUnique({
            where: {
                userId_workspaceId: {
                    userId: assigneeId,
                    workspaceId,
                },
            },
        });

        if (!member) {
            throw new Error("Assignee is not a workspace member");
        }
    }

    const updatedTask = await prisma.task.update({
        where: {
            id: taskId,
        },
        data: {
            assigneeId,
            version: {
                increment: 1,
            },
        },
    });

    await invalidate(workspaceId, task.list.boardId);

    if (userId) {
        await createActivityLog(
            workspaceId,
            userId,
            "TASK_ASSIGNED",
            "TASK",
            task.id
        );
    }

    emitBoardEvent(
        task.list.boardId,
        "task-assigned",
        updatedTask
    );

    return updatedTask;
}