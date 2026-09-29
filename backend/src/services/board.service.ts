import prisma from "../lib/prisma";
import redis from "../lib/redis";

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
  const cacheKey = `workspace:${workspaceId}:board:${boardId}`;

  const cachedBoard = await redis.get(cacheKey);

  if (cachedBoard) {
    return JSON.parse(cachedBoard);
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
    await redis.set(
      cacheKey,
      JSON.stringify(board),
      "EX",
      60
    );
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