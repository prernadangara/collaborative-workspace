import { Router } from "express";
import {
    addToTask,
    create,
    list,
} from "../controllers/label.controller";

import { requireAuth } from "../middleware/auth.middleware";
import {
    requireRole,
    requireWorkspaceMember,
} from "../middleware/workspace.middleware";

const router = Router();

router.get(
    "/workspaces/:workspaceId/labels",
    requireAuth,
    requireWorkspaceMember,
    list
);

router.post(
    "/workspaces/:workspaceId/labels",
    requireAuth,
    requireWorkspaceMember,
    requireRole("OWNER", "ADMIN", "MEMBER"),
    create
);

router.post(
    "/workspaces/:workspaceId/tasks/:taskId/labels/:labelId",
    requireAuth,
    requireWorkspaceMember,
    requireRole("OWNER", "ADMIN", "MEMBER"),
    addToTask
);

export default router;