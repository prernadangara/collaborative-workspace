import prisma from "../lib/prisma";

export async function createLabel(
    workspaceId: string,
    name: string
) {
    return prisma.label.create({
        data: {
            name: name.trim(),
            workspaceId,
        },
    });
}

export async function getWorkspaceLabels(
    workspaceId: string
) {
    return prisma.label.findMany({
        where: {
            workspaceId,
        },
        orderBy: {
            name: "asc",
        },
    });
}

export async function addLabelToTask(
    taskId: string,
    labelId: string,
    workspaceId: string
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
    });

    if (!task) {
        throw new Error("Task not found");
    }

    const label = await prisma.label.findFirst({
        where: {
            id: labelId,
            workspaceId,
        },
    });

    if (!label) {
        throw new Error("Label not found");
    }

    return prisma.taskLabel.create({
        data: {
            taskId,
            labelId,
        },
    });
}