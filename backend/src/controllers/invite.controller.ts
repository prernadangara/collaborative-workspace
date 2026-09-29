import { Request, Response } from "express";
import {
  createInvite,
  acceptInvite,
} from "../services/invite.service";

export async function create(req: Request, res: Response) {
  try {
    const workspaceId = req.params.workspaceId as string;
    const { email, role } = req.body;

    if (!workspaceId || !email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const allowedRoles = ["ADMIN", "MEMBER", "VIEWER"];

    if (role && !allowedRoles.includes(role)) {
      return res.status(400).json({
        message: "Invalid role",
      });
    }

    const invite = await createInvite(
      workspaceId,
      email,
      role || "MEMBER",
      {
        userId: req.userId!,
        role: req.role!,
      }
    );

    return res.status(201).json(invite);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create invite";

    return res.status(400).json({ message });
  }
}
export async function accept(req: Request, res: Response) {
  try {
    const { token } = req.body;
    const userId = req.userId;

    if (!token) {
      return res.status(400).json({
        message: "Invite token is required",
      });
    }

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const membership = await acceptInvite(token, userId);

    return res.status(200).json({
      message: "Invite accepted",
      membership,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to accept invite";

    return res.status(400).json({ message });
  }
}