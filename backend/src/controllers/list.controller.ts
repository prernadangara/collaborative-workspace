import { Request, Response } from "express";
import { createList } from "../services/list.service";

interface WorkspaceRequest extends Request {
    userId?: string;
    workspaceId?: string;
    role?: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
}

export async function create(req: WorkspaceRequest, res: Response) {
    try {
        const { name } = req.body;
        const boardId = req.params.boardId as string;

        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({
                message: "List name is required",
            });
        }

        if (!boardId) {
            return res.status(400).json({
                message: "Board ID is required",
            });
        }

        const list = await createList(
            boardId,
            req.workspaceId!,
            name
        );

        return res.status(201).json({
            message: "List created successfully",
            list,
        });
    } catch {
        return res.status(500).json({
            message: "Something went wrong",
        });
    }
}