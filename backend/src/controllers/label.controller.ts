import { Request, Response } from "express";
import {
    addLabelToTask,
    createLabel,
    getWorkspaceLabels,
} from "../services/label.service";

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
        const { name } = req.body;

        if (
            !name ||
            typeof name !== "string" ||
            !name.trim()
        ) {
            return res.status(400).json({
                message: "Label name is required",
            });
        }

        if (!req.workspaceId) {
            return res.status(400).json({
                message: "Workspace ID is required",
            });
        }

        const label = await createLabel(
            req.workspaceId,
            name
        );

        return res.status(201).json({
            message: "Label created successfully",
            label,
        });
    } catch (error) {
        console.error("Create label error:", error);

        return res.status(500).json({
            message: "Something went wrong",
        });
    }
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

        const labels = await getWorkspaceLabels(
            req.workspaceId
        );

        return res.status(200).json({
            labels,
        });
    } catch (error) {
        console.error("List labels error:", error);

        return res.status(500).json({
            message: "Something went wrong",
        });
    }
}

export async function addToTask(
    req: WorkspaceRequest,
    res: Response
) {
    try {
        const taskId = req.params.taskId as string;
        const labelId = req.params.labelId as string;

        if (!req.workspaceId) {
            return res.status(400).json({
                message: "Workspace ID is required",
            });
        }

        if (!taskId || !labelId) {
            return res.status(400).json({
                message: "Task ID and label ID are required",
            });
        }

        const taskLabel = await addLabelToTask(
            taskId,
            labelId,
            req.workspaceId
        );

        return res.status(201).json({
            message: "Label added to task successfully",
            taskLabel,
        });
    } catch (error) {
        if (
            error instanceof Error &&
            (error.message === "Task not found" ||
                error.message === "Label not found")
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