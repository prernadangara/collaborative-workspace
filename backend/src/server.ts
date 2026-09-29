import type { NextFunction, Request, Response } from "express";
import { startWorker } from "./workers/task.worker";
import { scheduleDailyDigest } from "./queues/task.queue";
import prisma from "./lib/prisma";
import redis from "./lib/redis";
import authRoutes from "./routes/auth.routes";
import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import workspaceRoutes from "./routes/workspace.routes";
import boardRoutes from "./routes/board.routes";
import listRoutes from "./routes/list.routes";
import taskRoutes from "./routes/task.routes";
import activityRoutes from "./routes/activity.routes";
import labelRoutes from "./routes/label.routes";
import inviteRoutes from "./routes/invite.routes";
import memberRoutes from "./routes/member.routes";
import { createServer } from "http";
import { Server } from "socket.io";
import { authenticateSocket, verifyWorkspaceAccess } from "./socket";
import { setSocketServer } from "./socket-events";

export const app = express();
const PORT = Number(process.env.PORT) || 5000;
const CLIENT_URL =
  process.env.CLIENT_URL || "http://localhost:5173";

// Render/Heroku-style platforms terminate TLS in a proxy; needed for secure cookies.
app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use("/api/auth", authRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api", boardRoutes);
app.use("/api", listRoutes);
app.use("/api", taskRoutes);
app.use("/api", activityRoutes);
app.use("/api", labelRoutes);
app.use("/api", inviteRoutes);
app.use("/api", memberRoutes);

app.get("/health", async (_req, res) => {
  // Liveness + dependency status. Redis is optional for correctness, so its
  // absence reports "degraded" rather than failing the check.
  let database = "ok";
  let cache = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "down";
  }

  try {
    await redis.ping();
  } catch {
    cache = "down";
  }

  const status = database === "ok" ? (cache === "ok" ? "ok" : "degraded") : "down";

  res.status(database === "ok" ? 200 : 503).json({ status, database, cache });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` });
});

// Last-resort handler: never leak stack traces to clients.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", error);
  res.status(500).json({ message: "Something went wrong" });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    credentials: true,
  },
});
setSocketServer(io);

io.use((socket, next) => {
  try {
    const userId = authenticateSocket(socket);

    socket.data.userId = userId;

    next();
  } catch {
    next(new Error("Authentication failed"));
  }
});

io.on("connection", (socket) => {
  console.log(
    `Socket connected: ${socket.id} (user: ${socket.data.userId})`
  );

  socket.on("join-board", async ({ workspaceId, boardId }) => {
    try {
      await verifyWorkspaceAccess(
        socket.data.userId,
        workspaceId,
        boardId
      );

      socket.join(`board:${boardId}`);

      // Remember which workspace each joined board belongs to so members
      // removed later can be evicted from the room.
      socket.data.boards = {
        ...(socket.data.boards ?? {}),
        [boardId]: workspaceId,
      };

      socket.emit("joined-board", {
        boardId,
      });
    } catch {
      socket.emit("socket-error", {
        message: "Workspace access denied",
      });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

if (process.env.NODE_ENV !== "test") {
  httpServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });

  // API and worker share one process to keep the Render footprint to a single
  // service. Split `startWorker()` into its own entrypoint to scale separately.
  startWorker();
  void scheduleDailyDigest();
}