import { Server } from "socket.io";

let io: Server | null = null;

export function setSocketServer(server: Server) {
  io = server;
}

export function emitBoardEvent(
  boardId: string,
  event: string,
  data: unknown
) {
  if (!io) {
    return;
  }

  io.to(`board:${boardId}`).emit(event, data);
}

/**
 * When a member is removed or demoted to a role that can no longer see the
 * workspace, drop their live sockets out of that workspace's board rooms so
 * they stop receiving events immediately (not just on next reconnect).
 */
export async function evictUserFromWorkspace(
  userId: string,
  workspaceId: string
) {
  if (!io) {
    return;
  }

  const sockets = await io.fetchSockets();

  for (const socket of sockets) {
    if (socket.data.userId !== userId) continue;

    const boards: Record<string, string> = socket.data.boards ?? {};
    for (const [boardId, boardWorkspaceId] of Object.entries(boards)) {
      if (boardWorkspaceId === workspaceId) {
        socket.leave(`board:${boardId}`);
        delete boards[boardId];
      }
    }
  }
}
