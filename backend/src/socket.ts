import { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import "dotenv/config";
import prisma from "./lib/prisma.js";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;

export function authenticateSocket(socket: Socket) {
  const token = socket.handshake.auth?.token;

  if (!token) {
    throw new Error("Authentication required");
  }

  const payload = jwt.verify(token, ACCESS_SECRET) as {
    userId: string;
  };

  return payload.userId;
}
export async function verifyWorkspaceAccess(
  userId: string,
  workspaceId: string,
  boardId?: string
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
    throw new Error("Workspace access denied");
  }

  if (boardId) {
    const board = await prisma.board.findFirst({
      where: {
        id: boardId,
        workspaceId,
      },
    });

    if (!board) {
      throw new Error("Board access denied");
    }
  }

  return membership;
}