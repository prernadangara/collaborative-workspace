import { Request, Response } from "express";
import {
  assignTask,
  createTask,
  deleteTask,
  moveTask,
  searchTasks,
  updateTask,
} from "../services/task.service";
import { emitBoardEvent } from "../socket-events";

interface WorkspaceRequest extends Request {
  userId?: string;
  workspaceId?: string;
  role?: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
}

export async function create(
  req: WorkspaceRequest,
  res: Response
) {
  try {
    const { title, description } = req.body;
    const listId = req.params.listId as string;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        message: "Task title is required",
      });
    }

    if (!listId) {
      return res.status(400).json({
        message: "List ID is required",
      });
    }

    const task = await createTask(
      listId,
      req.workspaceId!,
      title,
      description,
      req.userId
    );

    return res.status(201).json({
      message: "Task created successfully",
      task,
    });
  } catch {
    return res.status(500).json({
      message: "Something went wrong",
    });
  }
}

export async function update(
  req: WorkspaceRequest,
  res: Response
) {
  try {
    const taskId = req.params.taskId as string;
    const {
      title,
      description,
      version,
      status,
    } = req.body;

    if (!req.workspaceId) {
      return res.status(400).json({
        message: "Workspace ID is required",
      });
    }

    if (
      title !== undefined &&
      (typeof title !== "string" || !title.trim())
    ) {
      return res.status(400).json({
        message: "Task title cannot be empty",
      });
    }

    if (!Number.isInteger(version) || version < 1) {
      return res.status(400).json({
        message: "Valid task version is required",
      });
    }

    const task = await updateTask(
      taskId,
      req.workspaceId,
      version,
      title,
      description,
      req.userId,
      status
    );

    return res.status(200).json({
      message: "Task updated successfully",
      task,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Task not found"
    ) {
      return res.status(404).json({ message: error.message });
    }

    if (
      error instanceof Error &&
      error.message === "Task version conflict"
    ) {
      return res.status(409).json({
        message: "Task was modified by another user. Please refresh and try again.",
      });
    }

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
}
export async function remove(
  req: WorkspaceRequest,
  res: Response
) {
  try {
    const taskId = req.params.taskId as string;

    if (!req.workspaceId) {
      return res.status(400).json({
        message: "Workspace ID is required",
      });
    }

    await deleteTask(
      taskId,
      req.workspaceId,
      req.userId
    );

    return res.status(200).json({
      message: "Task deleted successfully",
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Task not found"
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
export async function search(
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
        Number.parseInt(req.query.limit as string) || 10,
        1
      ),
      50
    );

    const searchTerm =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : undefined;

    const status =
      req.query.status === "TODO" ||
        req.query.status === "IN_PROGRESS" ||
        req.query.status === "DONE"
        ? req.query.status
        : undefined;

    const assigneeId =
      typeof req.query.assigneeId === "string"
        ? req.query.assigneeId.trim()
        : undefined;

    const labelId =
      typeof req.query.labelId === "string"
        ? req.query.labelId.trim()
        : undefined;

    const result = await searchTasks(
      req.workspaceId,
      page,
      limit,
      searchTerm,
      status,
      assigneeId,
      labelId
    );

    return res.status(200).json(result);
  } catch {
    return res.status(500).json({
      message: "Something went wrong",
    });
  }
}
export async function move(
  req: WorkspaceRequest,
  res: Response
) {
  try {
    const taskId = req.params.taskId as string;
    const { targetListId, targetPosition } = req.body;

    if (!req.workspaceId) {
      return res.status(400).json({
        message: "Workspace ID is required",
      });
    }

    if (!taskId) {
      return res.status(400).json({
        message: "Task ID is required",
      });
    }

    if (
      !targetListId ||
      typeof targetListId !== "string"
    ) {
      return res.status(400).json({
        message: "Target list ID is required",
      });
    }

    if (
      typeof targetPosition !== "number" ||
      !Number.isFinite(targetPosition)
    ) {
      return res.status(400).json({
        message: "Valid target position is required",
      });
    }

    const task = await moveTask(
      taskId,
      req.workspaceId,
      targetListId,
      targetPosition,
      req.userId
    );

    return res.status(200).json({
      message: "Task moved successfully",
      task,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Task not found" ||
        error.message === "Target list not found")
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
export async function assign(req: WorkspaceRequest, res: Response) {
  try {
    const taskId = req.params.taskId as string;
    const { assigneeId } = req.body;

    if (!req.workspaceId) {
      return res.status(400).json({
        message: "Workspace ID is required",
      });
    }

    if (assigneeId !== null && typeof assigneeId !== "string") {
      return res.status(400).json({
        message: "Valid assignee ID is required",
      });
    }

    const task = await assignTask(
      taskId,
      req.workspaceId,
      assigneeId,
      req.userId
    );

    return res.status(200).json({
      message: "Task assignment updated successfully",
      task,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Task not found"
    ) {
      return res.status(404).json({
        message: error.message,
      });
    }

    if (
      error instanceof Error &&
      error.message === "Assignee is not a workspace member"
    ) {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
}