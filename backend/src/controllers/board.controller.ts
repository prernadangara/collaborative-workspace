import { Request, Response } from "express";
import {
  createBoard,
  getBoard,
  getWorkspaceBoards,
} from "../services/board.service";

interface WorkspaceRequest extends Request {
    userId?: string;
    workspaceId?: string;
    role?: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
}

export async function create(req: WorkspaceRequest, res: Response) {
    try {
        const { name } = req.body;

        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({
                message: "Board name is required",
            });
        }

        if (!req.workspaceId) {
            return res.status(400).json({
                message: "Workspace ID is required",
            });
        }

        const board = await createBoard(
            req.workspaceId!,
            name
        );

        return res.status(201).json({
            message: "Board created successfully",
            board,
        });
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === "Workspace not found"
        ) {
            return res.status(404).json({
                message: error.message,
            });
        }

        return res.status(500).json({
            message: "Something went wrong",
        });
    }
}
export async function getOne(
    req: WorkspaceRequest,
    res: Response
) {
    try {
        const boardId = req.params.boardId as string;

        if (!req.workspaceId) {
            return res.status(400).json({
                message: "Workspace ID is required",
            });
        }

        const board = await getBoard(
            boardId,
            req.workspaceId
        );

        if (!board) {
            return res.status(404).json({
                message: "Board not found",
            });
        }

        return res.status(200).json({
            board,
        });
    } catch {
        return res.status(500).json({
            message: "Something went wrong",
        });
    }
}
export async function list(req: Request, res: Response) {
  try {
    const workspaceId = req.params.workspaceId as string;

    if (!workspaceId) {
      return res.status(400).json({
        message: "Workspace ID is required",
      });
    }

    const boards = await getWorkspaceBoards(workspaceId);

    return res.status(200).json({ boards });
  } catch {
    return res.status(500).json({
      message: "Something went wrong",
    });
  }
}