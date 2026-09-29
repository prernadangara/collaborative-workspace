import redis from "./lib/redis";
import authRoutes from "./routes/auth.routes";
import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { requireAuth } from "./middleware/auth.middleware";
import workspaceRoutes from "./routes/workspace.routes";
import { requireWorkspaceMember } from "./middleware/workspace.middleware";
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
const PORT = 5000;
const CLIENT_URL =
  process.env.CLIENT_URL || "http://localhost:5173";

app.use(helmet());
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());
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

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "Collaborative Workspace API is running",
  });
});

app.get("/api/protected", requireAuth, (req, res) => {
  res.json({
    message: "You are authenticated",
  });
});

app.get(
  "/api/workspaces/:workspaceId/test-access",
  requireAuth,
  requireWorkspaceMember,
  (req, res) => {
    res.json({
      message: "Workspace access granted",
    });
  }
);

redis
  .ping()
  .then(() => {
    console.log("Redis connection OK");
  })
  .catch((error) => {
    console.error("Redis connection failed:", error);
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

if (process.env.NODE_ENV !== "test") {
  httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}