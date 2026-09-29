import prisma from "../lib/prisma";
import redis from "../lib/redis";
import { emitBoardEvent } from "../socket-events";

export async function createList(
  boardId: string,
  workspaceId: string,
  name: string
) {
  const board = await prisma.board.findFirst({
    where: {
      id: boardId,
      workspaceId,
    },
  });

  if (!board) {
    throw new Error("Board not found");
  }

  const lastList = await prisma.list.findFirst({
    where: {
      boardId,
    },
    orderBy: {
      position: "desc",
    },
  });

  const position = lastList
    ? lastList.position + 1
    : 1;

  const list = await prisma.list.create({
    data: {
      name: name.trim(),
      boardId,
      position,
    },
  });

  await redis.del(
    `workspace:${workspaceId}:board:${boardId}`
  );

  emitBoardEvent(
    boardId,
    "list-created",
    list
  );

  return list;
}