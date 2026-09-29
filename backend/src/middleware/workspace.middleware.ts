import { NextFunction, Request, Response } from "express";
import { getMembership } from "../services/membership.service";

interface WorkspaceRequest extends Request {
  userId?: string;
  workspaceId?: string;
  role?: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
}

export async function requireWorkspaceMember(
  req: WorkspaceRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const workspaceId = req.params.workspaceId as string;

    if (!req.userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    if (!workspaceId) {
      return res.status(400).json({
        message: "Workspace ID is required",
      });
    }

    const membership = await getMembership(
      req.userId,
      workspaceId
    );

    if (!membership) {
      return res.status(403).json({
        message: "You do not have access to this workspace",
      });
    }

    req.workspaceId = workspaceId;
    req.role = membership.role;

    next();
  } catch {
    return res.status(500).json({
      message: "Something went wrong",
    });
  }
}
export function requireRole(
  ...allowedRoles: Array<"OWNER" | "ADMIN" | "MEMBER" | "VIEWER">
) {
  return (
    req: WorkspaceRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.role || !allowedRoles.includes(req.role)) {
      return res.status(403).json({
        message: "Insufficient permissions",
      });
    }

    next();
  };
}