import { Router } from "express";
import {
  create,
  list,
} from "../controllers/workspace.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/", requireAuth, create);
router.get("/", requireAuth, list);

export default router;