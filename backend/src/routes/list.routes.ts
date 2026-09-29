import { Router } from "express";
import { create } from "../controllers/list.controller";
import { requireAuth } from "../middleware/auth.middleware";
import {
  requireRole,
  requireWorkspaceMember,
} from "../middleware/workspace.middleware";

const router = Router();

router.post(
  "/workspaces/:workspaceId/boards/:boardId/lists",
  requireAuth,
  requireWorkspaceMember,
  requireRole("OWNER", "ADMIN", "MEMBER"),
  create
);

export default router;