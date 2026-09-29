import { Router } from "express";
import { list } from "../controllers/activity.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireWorkspaceMember } from "../middleware/workspace.middleware";

const router = Router();

router.get(
    "/workspaces/:workspaceId/activity",
    requireAuth,
    requireWorkspaceMember,
    list
);

export default router;