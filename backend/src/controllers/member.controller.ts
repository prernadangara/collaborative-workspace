import { Request, Response } from "express";
import {
  ForbiddenError,
  NotFoundError,
  getWorkspaceMembers,
  updateMemberRole,
  removeMember,
} from "../services/member.service";

type ActorRequest = Request & { userId?: string; role?: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" };

function fail(res: Response, error: unknown, fallback: string) {
  if (error instanceof ForbiddenError) {
    return res.status(403).json({ message: error.message });
  }
  if (error instanceof NotFoundError) {
    return res.status(404).json({ message: error.message });
  }
  return res.status(500).json({ message: fallback });
}

export async function list(req: Request, res: Response) {
  try {
    const workspaceId = req.params.workspaceId as string;

    const members = await getWorkspaceMembers(workspaceId);

    return res.status(200).json({
      members,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to get workspace members";

    return res.status(400).json({ message });
  }
}
export async function updateRole(req: ActorRequest, res: Response) {
  try {
    const workspaceId = req.params.workspaceId as string;
    const userId = req.params.userId as string;
    const { role } = req.body;

    const allowedRoles = ["ADMIN", "MEMBER", "VIEWER"];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        message: "Invalid role",
      });
    }

    const membership = await updateMemberRole(
      workspaceId,
      userId,
      role,
      { userId: req.userId!, role: req.role! }
    );

    return res.status(200).json({
      membership,
    });
  } catch (error) {
    return fail(res, error, "Failed to update member role");
  }
}
export async function remove(req: ActorRequest, res: Response) {
  try {
    const workspaceId = req.params.workspaceId as string;
    const userId = req.params.userId as string;

    await removeMember(workspaceId, userId, {
      userId: req.userId!,
      role: req.role!,
    });

    return res.status(200).json({
      message: "Member removed successfully",
    });
  } catch (error) {
    return fail(res, error, "Failed to remove member");
  }
}