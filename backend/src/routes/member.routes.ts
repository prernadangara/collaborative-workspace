import { Router } from "express";
import {
  list,
  updateRole,
  remove,
} from "../controllers/member.controller";
import { requireAuth } from "../middleware/auth.middleware";
import {
  requireWorkspaceMember,
  requireRole,
} from "../middleware/workspace.middleware";

const router = Router();

router.get(
  "/workspaces/:workspaceId/members",
  requireAuth,
  requireWorkspaceMember,
  list
);

router.patch(
  "/workspaces/:workspaceId/members/:userId/role",
  requireAuth,
  requireWorkspaceMember,
  requireRole("OWNER", "ADMIN"),
  updateRole
);
router.delete(
  "/workspaces/:workspaceId/members/:userId",
  requireAuth,
  requireWorkspaceMember,
  requireRole("OWNER", "ADMIN"),
  remove
);

export default router;