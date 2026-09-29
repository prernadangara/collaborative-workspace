import prisma from "../lib/prisma";
import { boardCacheKey, cacheGet, cacheSet, summaryCacheKey } from "../lib/cache";

export async function createBoard(
  workspaceId: string,
  name: string
) {
  const workspace = await prisma.workspace.findUnique({
    where: {
      id: workspaceId,
    },
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  return prisma.board.create({
    data: {
      name: name.trim(),
      workspaceId,
    },
  });
}
export async function getBoard(
  boardId: string,
  workspaceId: string
) {
  const cacheKey = boardCacheKey(workspaceId, boardId);

  const cachedBoard = await cacheGet<unknown>(cacheKey);

  if (cachedBoard) {
    return cachedBoard;
  }

  const board = await prisma.board.findFirst({
    where: {
      id: boardId,
      workspaceId,
    },
    include: {
      lists: {
        orderBy: {
          position: "asc",
        },
        include: {
          tasks: {
            orderBy: {
              position: "asc",
            },
          },
        },
      },
    },
  });

  if (board) {
    await cacheSet(cacheKey, board, 60);
  }

  return board;
}
export async function getWorkspaceBoards(workspaceId: string) {
  return prisma.board.findMany({
    where: {
      workspaceId,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}
/**
 * Workspace dashboard: several aggregate queries, so it is the "expensive
 * read" we cache. Invalidated on any task/list mutation (see task.service)
 * with a 5-minute TTL as a safety net.
 */
export async function getWorkspaceSummary(workspaceId: string) {
  const key = summaryCacheKey(workspaceId);
  const cached = await cacheGet<unknown>(key);
  if (cached) {
    return { ...(cached as object), cached: true };
  }

  const taskScope = { list: { board: { workspaceId } } };

  const [boards, members, byStatus, byAssignee, recentActivity] =
    await Promise.all([
      prisma.board.count({ where: { workspaceId } }),
      prisma.membership.count({ where: { workspaceId } }),
      prisma.task.groupBy({
        by: ["status"],
        where: taskScope,
        _count: { _all: true },
      }),
      prisma.task.groupBy({
        by: ["assigneeId"],
        where: taskScope,
        _count: { _all: true },
      }),
      prisma.activityLog.count({
        where: {
          workspaceId,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

  const summary = {
    boards,
    members,
    tasksByStatus: Object.fromEntries(
      byStatus.map((row) => [row.status, row._count._all])
    ),
    tasksByAssignee: byAssignee.map((row) => ({
      assigneeId: row.assigneeId,
      count: row._count._all,
    })),
    activityLast24h: recentActivity,
  };

  await cacheSet(key, summary, 300);
  return { ...summary, cached: false };
}
