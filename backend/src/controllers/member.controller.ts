import { Request, Response } from "express";
import {
  getWorkspaceMembers,
  updateMemberRole,
  removeMember,
} from "../services/member.service";

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
export async function updateRole(req: Request, res: Response) {
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
      role
    );

    return res.status(200).json({
      membership,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update member role";

    return res.status(400).json({ message });
  }
}
export async function remove(req: Request, res: Response) {
  try {
    const workspaceId = req.params.workspaceId as string;
    const userId = req.params.userId as string;

    await removeMember(workspaceId, userId);

    return res.status(200).json({
      message: "Member removed successfully",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to remove member";

    return res.status(400).json({ message });
  }
}