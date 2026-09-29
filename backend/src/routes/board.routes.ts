import { Router } from "express";
import {
    create,
    getOne,
    list,
    summary,
} from "../controllers/board.controller";
import { requireAuth } from "../middleware/auth.middleware";
import {
    requireRole,
    requireWorkspaceMember,
} from "../middleware/workspace.middleware";

const router = Router();

router.get(
  "/workspaces/:workspaceId/summary",
  requireAuth,
  requireWorkspaceMember,
  summary
);

router.post(
    "/workspaces/:workspaceId/boards",
    requireAuth,
    requireWorkspaceMember,
    requireRole("OWNER", "ADMIN", "MEMBER"),
    create
);

router.get(
  "/workspaces/:workspaceId/boards/:boardId",
  requireAuth,
  requireWorkspaceMember,
  getOne
);
router.get(
  "/workspaces/:workspaceId/boards",
  requireAuth,
  requireWorkspaceMember,
  list
);

export default router;