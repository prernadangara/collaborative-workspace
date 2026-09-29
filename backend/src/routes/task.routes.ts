import { Router } from "express";
import {
  assign,
  create,
  update,
  remove,
  search,
  move,
} from "../controllers/task.controller";
import { requireAuth } from "../middleware/auth.middleware";
import {
  requireRole,
  requireWorkspaceMember,
} from "../middleware/workspace.middleware";

const router = Router();

router.get(
  "/workspaces/:workspaceId/tasks",
  requireAuth,
  requireWorkspaceMember,
  search
);

router.post(
  "/workspaces/:workspaceId/lists/:listId/tasks",
  requireAuth,
  requireWorkspaceMember,
  requireRole("OWNER", "ADMIN", "MEMBER"),
  create
);

router.patch(
  "/workspaces/:workspaceId/tasks/:taskId",
  requireAuth,
  requireWorkspaceMember,
  requireRole("OWNER", "ADMIN", "MEMBER"),
  update
);
router.patch(
  "/workspaces/:workspaceId/tasks/:taskId/move",
  requireAuth,
  requireWorkspaceMember,
  requireRole("OWNER", "ADMIN", "MEMBER"),
  move
);

router.delete(
  "/workspaces/:workspaceId/tasks/:taskId",
  requireAuth,
  requireWorkspaceMember,
  requireRole("OWNER", "ADMIN", "MEMBER"),
  remove
);
router.patch(
  "/workspaces/:workspaceId/tasks/:taskId/assignee",
  requireAuth,
  requireWorkspaceMember,
  requireRole("OWNER", "ADMIN", "MEMBER"),
  assign
);

export default router;