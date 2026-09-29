import { Request, Response } from "express";
import {
    createWorkspace,
    getUserWorkspaces,
} from "../services/workspace.service";

interface AuthenticatedRequest extends Request {
    userId?: string;
}

export async function create(req: AuthenticatedRequest, res: Response) {
    try {
        const { name } = req.body;

        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({
                message: "Workspace name is required",
            });
        }

        if (!req.userId) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }

        const workspace = await createWorkspace(req.userId, name);

        return res.status(201).json({
            message: "Workspace created successfully",
            workspace,
        });
    } catch {
        return res.status(500).json({
            message: "Something went wrong",
        });
    }
}
export async function list(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const workspaces = await getUserWorkspaces(req.userId);

    return res.status(200).json({
      workspaces,
    });
  } catch {
    return res.status(500).json({
      message: "Something went wrong",
    });
  }
}