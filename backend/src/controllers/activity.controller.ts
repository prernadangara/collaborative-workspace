import { Request, Response } from "express";
import { getWorkspaceActivityLogs } from "../services/activity.service";

interface WorkspaceRequest extends Request {
    userId?: string;
    workspaceId?: string;
    role?: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
}

export async function list(
    req: WorkspaceRequest,
    res: Response
) {
    try {
        if (!req.workspaceId) {
            return res.status(400).json({
                message: "Workspace ID is required",
            });
        }

        const page = Math.max(
            Number.parseInt(req.query.page as string) || 1,
            1
        );

        const limit = Math.min(
            Math.max(
                Number.parseInt(req.query.limit as string) || 20,
                1
            ),
            50
        );

        const result = await getWorkspaceActivityLogs(
            req.workspaceId,
            page,
            limit
        );

        return res.status(200).json(result);
    } catch {
        return res.status(500).json({
            message: "Something went wrong",
        });
    }
}