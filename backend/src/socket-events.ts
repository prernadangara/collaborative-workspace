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