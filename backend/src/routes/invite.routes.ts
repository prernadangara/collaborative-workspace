import { Router } from "express";
import { create, accept } from "../controllers/invite.controller";
import { requireAuth } from "../middleware/auth.middleware";
import {
  requireWorkspaceMember,
  requireRole,
} from "../middleware/workspace.middleware";

const router = Router();

router.post(
  "/workspaces/:workspaceId/invites",
  requireAuth,
  requireWorkspaceMember,
  requireRole("OWNER", "ADMIN"),
  create
);

router.post(
  "/invites/accept",
  requireAuth,
  accept
);

export default router;