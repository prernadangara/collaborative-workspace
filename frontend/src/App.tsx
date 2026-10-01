import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import api from "./api";
import socket from "./socket";
import logo from "./assets/collaborative-workspace-logo.png";

interface Task {
  id: string;
  title: string;
  description: string | null;
  position: number;
  listId: string;
  assigneeId: string | null;
  version: number;
  status: "TODO" | "IN_PROGRESS" | "DONE";
}

interface TaskList {
  id: string;
  name: string;
  position: number;
  tasks: Task[];
}

interface Board {
  id: string;
  name: string;
  workspaceId: string;
  lists: TaskList[];
}

interface Workspace {
  id: string;
  name: string;
}

interface Member {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
}

interface ActivityLog {
  id: string;
  workspaceId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
}

function DraggableTask({
  task,
  children,
}: {
  task: Task;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
  } = useDraggable({
    id: task.id,
  });

  const style = transform
    ? {
      transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  );
}

function DroppableList({
  listId,
  children,
}: {
  listId: string;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: listId,
  });

  return (
    <div
      ref={setNodeRef}
      className="kanban-column"
      style={{
        border: isOver
          ? "2px dashed var(--accent)"
          : "1px solid var(--border)",
        background: isOver
          ? "var(--accent-bg)"
          : undefined,
      }}
    >
      {children}
    </div>
  );
}

function ActivityIcon({ action }: { action: string }) {
  if (action === "TASK_DELETED") {
    return (
      <svg
        className="activity-icon activity-icon-delete"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v5" />
        <path d="M14 11v5" />
      </svg>
    );
  }

  if (action === "TASK_CREATED") {
    return (
      <svg
        className="activity-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="m16 9-5.5 5.5L8 12" />
      </svg>
    );
  }

  if (action === "TASK_UPDATED") {
    return (
      <svg
        className="activity-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.924a.5.5 0 0 0 .61.61l4.924-1.32a2 2 0 0 0 .83-.5z" />
        <path d="m15 5 4 4" />
      </svg>
    );
  }

  if (action === "INVITE_CREATED") {
    return (
      <svg
        className="activity-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M19 8v6" />
        <path d="M22 11h-6" />
      </svg>
    );
  }

  // TASK_MOVED
  return (
    <svg
      className="activity-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 19L19 5" />
      <path d="M10 5h9v9" />
    </svg>
  );
}

function StatusIcon({ type }: { type: "success" | "error" }) {
  if (type === "success") {
    return (
      <svg
        className="status-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }

  return (
    <svg
      className="status-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [statusFilter, setStatusFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const statusMessageRef = useRef<HTMLParagraphElement>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);

  useEffect(() => {
    if (!message) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  const [labels, setLabels] = useState<
    { id: string; name: string }[]
  >([]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    console.log("DRAG RESULT:", {
      active: active.id,
      over: over?.id,
    });

    if (!over || !selectedBoard) {
      return;
    }

    if (active.id === over.id) {
      return;
    }

    const taskId = String(active.id);
    const targetListId = String(over.id);

    const targetList = selectedBoard.lists.find(
      (list) => list.id === targetListId
    );

    if (!targetList) {
      return;
    }

    try {
      await api.patch(
        `/workspaces/${selectedBoard.workspaceId}/tasks/${taskId}/move`,
        {
          targetListId,
          targetPosition: targetList.tasks.length + 1,
        }
      );
    } catch {
      setMessage("Could not move task");
      setMessageType("error");
    }
  }

  async function loadWorkspaces() {
    try {
      const response = await api.get("/workspaces");
      setWorkspaces(response.data.workspaces);
    } catch {
      setMessage("Could not load workspaces");
      setMessageType("error");
    }
  }

  async function loadMembers(workspaceId: string) {
    try {
      const response = await api.get(
        `/workspaces/${workspaceId}/members`
      );

      setMembers(
        response.data.members.map(
          (membership: {
            user: {
              id: string;
              name: string;
              email: string;
            };
            role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
          }) => ({
            ...membership.user,
            role: membership.role,
          })
        )
      );
    } catch {
      setMessage("Could not load workspace members");
      setMessageType("error");
    }
  }

  async function loadActivity(workspaceId: string) {
    try {
      const response = await api.get(
        `/workspaces/${workspaceId}/activity`,
        {
          params: {
            page: 1,
            limit: 20,
          },
        }
      );

      setActivityLogs(response.data.logs);
      setShowActivity(true);
    } catch {
      setMessage("Could not load activity");
      setMessageType("error");
    }
  }

  async function loadBoard(workspaceId: string) {
    try {
      const response = await api.get(
        `/workspaces/${workspaceId}/boards`
      );

      const firstBoard = response.data.boards[0];

      if (!firstBoard) {
        setMessage("No boards found");
        setMessageType("error");
        return;
      }

      const boardResponse = await api.get(
        `/workspaces/${workspaceId}/boards/${firstBoard.id}`
      );

      setSelectedBoard(boardResponse.data.board);
      await loadMembers(workspaceId);
      const labelResponse = await api.get(
        `/workspaces/${workspaceId}/labels`
      );

      setLabels(labelResponse.data.labels);
    } catch {
      setMessage("Could not load board");
      setMessageType("error");
    }
  }

  async function searchTasks() {
    if (!selectedBoard) {
      return;
    }
    try {
      const response = await api.get(
        `/workspaces/${selectedBoard.workspaceId}/tasks`,
        {
          params: {
            search: searchTerm,
            status: statusFilter || undefined,
            assigneeId: assigneeFilter || undefined,
            labelId: labelFilter || undefined,
          },
        }
      );

      const matchingTasks = response.data.tasks;

      setSelectedBoard((currentBoard) => {
        if (!currentBoard) {
          return currentBoard;
        }

        return {
          ...currentBoard,
          lists: currentBoard.lists.map((list) => ({
            ...list,
            tasks: matchingTasks.filter(
              (matchingTask: Task) =>
                matchingTask.listId === list.id
            ),
          })),
        };
      });
    } catch {
      setMessage("Could not search tasks");
      setMessageType("error");
    }
  }

  async function createTask(listId: string) {
    if (!selectedBoard) {
      return;
    }

    try {
      await api.post(
        `/workspaces/${selectedBoard.workspaceId}/lists/${listId}/tasks`,
        {
          title: "New Task",
          description: "Created from the workspace UI",
        }
      );
    } catch {
      setMessage("Could not create task");
      setMessageType("error");
    }
  }

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();

    try {
      const response = await api.post("/auth/login", {
        email,
        password,
      });

      localStorage.setItem(
        "accessToken",
        response.data.accessToken
      );

      socket.auth = {
        token: response.data.accessToken,
      };

      socket.connect();

      setMessage("Login successful!");

      await loadWorkspaces();
    } catch {
      setMessage("Invalid email or password");
      setMessageType("error");
    }
  }
  async function handleLogout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // Continue logging out locally even if the server request fails.
    }

    localStorage.removeItem("accessToken");
    socket.disconnect();

    setWorkspaces([]);
    setSelectedBoard(null);
    setMessage("Logged out successfully!");
    setMessageType("success");
  }
  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();

    try {
      await api.post("/auth/register", {
        name,
        email,
        password,
      });

      const response = await api.post("/auth/login", {
        email,
        password,
      });

      localStorage.setItem(
        "accessToken",
        response.data.accessToken
      );

      socket.auth = {
        token: response.data.accessToken,
      };

      socket.connect();

      setMessage("Account created successfully!");
      setMessageType("success");
      setIsRegistering(false);

      await loadWorkspaces();
    } catch (error: unknown) {
      setMessage(
        error instanceof Error ? error.message : "Could not create account"
      );
      setMessageType("error");
    }
  }

  async function handleCreateWorkspace(event: React.FormEvent) {
    event.preventDefault();

    if (!workspaceName.trim()) {
      return;
    }

    try {
      const workspaceResponse = await api.post("/workspaces", {
        name: workspaceName.trim(),
      });

      const workspaceId = workspaceResponse.data.workspace.id;

      const boardResponse = await api.post(
        `/workspaces/${workspaceId}/boards`,
        {
          name: "My Board",
        }
      );

      const boardId = boardResponse.data.board.id;

      await api.post(
        `/workspaces/${workspaceId}/boards/${boardId}/lists`,
        { name: "To Do" }
      );

      await api.post(
        `/workspaces/${workspaceId}/boards/${boardId}/lists`,
        { name: "In Progress" }
      );

      await api.post(
        `/workspaces/${workspaceId}/boards/${boardId}/lists`,
        { name: "Done" }
      );

      setMessage("Workspace created successfully!");
      setMessageType("success");
      setWorkspaceName("");
      setShowCreateWorkspace(false);

      await loadWorkspaces();
    } catch (error: unknown) {
      setMessage(
        error instanceof Error ? error.message : "Could not create workspace"
      );
      setMessageType("error");
    }
  }

  useEffect(() => {
    const token = localStorage.getItem("accessToken");

    if (token) {
      socket.auth = { token };
      socket.connect();

      const timeoutId = window.setTimeout(() => {
        void loadWorkspaces();
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, []);

  useEffect(() => {
    if (!selectedBoard) {
      return;
    }

    socket.emit("join-board", {
      workspaceId: selectedBoard.workspaceId,
      boardId: selectedBoard.id,
    });
  }, [selectedBoard]);

  useEffect(() => {
    function handleJoinedBoard(data: { boardId: string }) {
      console.log("Joined board:", data.boardId);
    }

    function handleTaskCreated(task: Task) {
      setSelectedBoard((currentBoard) => {
        if (!currentBoard) {
          return currentBoard;
        }

        return {
          ...currentBoard,
          lists: currentBoard.lists.map((list) => {
            if (list.id !== task.listId) {
              return list;
            }

            return {
              ...list,
              tasks: [...list.tasks, task],
            };
          }),
        };
      });
    }

    function handleTaskUpdated(updatedTask: Task) {
      setSelectedBoard((currentBoard) => {
        if (!currentBoard) {
          return currentBoard;
        }

        return {
          ...currentBoard,
          lists: currentBoard.lists.map((list) => ({
            ...list,
            tasks: list.tasks.map((task) =>
              task.id === updatedTask.id
                ? updatedTask
                : task
            ),
          })),
        };
      });
    }

    function handleTaskDeleted(data: { taskId: string }) {
      setSelectedBoard((currentBoard) => {
        if (!currentBoard) {
          return currentBoard;
        }

        return {
          ...currentBoard,
          lists: currentBoard.lists.map((list) => ({
            ...list,
            tasks: list.tasks.filter(
              (task) => task.id !== data.taskId
            ),
          })),
        };
      });
    }

    function handleTaskMoved(movedTask: Task) {
      setSelectedBoard((currentBoard) => {
        if (!currentBoard) {
          return currentBoard;
        }

        return {
          ...currentBoard,
          lists: currentBoard.lists.map((list) => {
            const withoutTask = list.tasks.filter(
              (task) => task.id !== movedTask.id
            );

            if (list.id === movedTask.listId) {
              return {
                ...list,
                tasks: [...withoutTask, movedTask],
              };
            }

            return {
              ...list,
              tasks: withoutTask,
            };
          }),
        };
      });
    }

    function handleListCreated(newList: TaskList) {
      setSelectedBoard((currentBoard) => {
        if (!currentBoard) {
          return currentBoard;
        }

        return {
          ...currentBoard,
          lists: [
            ...currentBoard.lists,
            {
              ...newList,
              tasks: [],
            },
          ],
        };
      });
    }

    function handleTaskAssigned(updatedTask: Task) {
      setSelectedBoard((currentBoard) => {
        if (!currentBoard) {
          return currentBoard;
        }

        return {
          ...currentBoard,
          lists: currentBoard.lists.map((list) => ({
            ...list,
            tasks: list.tasks.map((task) =>
              task.id === updatedTask.id
                ? updatedTask
                : task
            ),
          })),
        };
      });
    }

    socket.on("joined-board", handleJoinedBoard);
    socket.on("task-created", handleTaskCreated);
    socket.on("task-updated", handleTaskUpdated);
    socket.on("task-deleted", handleTaskDeleted);
    socket.on("task-moved", handleTaskMoved);
    socket.on("list-created", handleListCreated);
    socket.on("task-assigned", handleTaskAssigned);

    return () => {
      socket.off("joined-board", handleJoinedBoard);
      socket.off("task-created", handleTaskCreated);
      socket.off("task-updated", handleTaskUpdated);
      socket.off("task-deleted", handleTaskDeleted);
      socket.off("task-moved", handleTaskMoved);
      socket.off("list-created", handleListCreated);
      socket.off("task-assigned", handleTaskAssigned);
    };
  }, []);

  return (
    <div
      className={
        localStorage.getItem("accessToken")
          ? "app-shell"
          : "app-shell auth-shell"
      }
    >

      <div className="brand-header">
        <img
          src={logo}
          alt="Collaborative Workspace"
          className="brand-logo"
        />
        <h1 className="app-title">Collaborative Workspace</h1>

        {localStorage.getItem("accessToken") && (
          <button
            type="button"
            className="logout-button"
            onClick={handleLogout}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m16 17 5-5-5-5" />
              <path d="M21 12H9" />
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            </svg>
            Logout
          </button>
        )}
      </div>

      {message && (
        <p
          ref={statusMessageRef}
          className={`status-message ${messageType}`}
        >
          <StatusIcon type={messageType} />
          <span>{message}</span>
        </p>
      )}

      {!localStorage.getItem("accessToken") && (
        <div className="auth-card">
          <div className="auth-heading">
            <h2>{isRegistering ? "Create an account" : "Welcome back"}</h2>
            <p>
              {isRegistering
                ? "Create your workspace account to get started."
                : "Sign in to continue to your workspace."}
            </p>
          </div>

          <form
            className="login-form"
            onSubmit={isRegistering ? handleRegister : handleLogin}
          >
            {isRegistering && (
              <div className="auth-field">
                <label htmlFor="name">NAME</label>

                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="email">EMAIL</label>

              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
              />
            </div>

            <div className="auth-field">
              <div className="password-label-row">
                <label htmlFor="password">PASSWORD</label>

                <button
                  type="button"
                  className="forgot-password"
                >
                  Forgot password?
                </button>
              </div>

              <div className="password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowPassword((current) => !current)
                  }
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                >
                  {showPassword ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                      <path d="m2 2 20 20" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={
                !email.trim() ||
                !password.trim() ||
                (isRegistering && !name.trim())
              }
            >
              {isRegistering ? "Create Account" : "Login"}
            </button>
          </form>

          <button
            type="button"
            className="auth-toggle"
            onClick={() => {
              setIsRegistering((current) => !current);
              setMessage("");
            }}
          >
            {isRegistering ? (
              <>
                Already have an account?{" "}
                <span className="auth-toggle-link">Login</span>
              </>
            ) : (
              <>
                Don't have an account?{" "}
                <span className="auth-toggle-link">Register</span>
              </>
            )}
          </button>
        </div>
      )}

      {localStorage.getItem("accessToken") &&
        (workspaces.length === 0 || showCreateWorkspace) && (

          <div className="create-workspace-overlay">
            <form
              className="create-workspace-form"
              onSubmit={handleCreateWorkspace}
            >
              <h2 className="section-title">Create Your Workspace</h2>

              <input
                type="text"
                placeholder="Workspace name"
                value={workspaceName}
                onChange={(event) =>
                  setWorkspaceName(event.target.value)
                }
              />

              <button type="submit">Create Workspace</button>

              <button
                type="button"
                className="cancel-workspace"
                onClick={() => {
                  setWorkspaceName("");
                  setShowCreateWorkspace(false);
                }}
              >
                Cancel
              </button>

            </form>
          </div>
        )}

      {editingTask && (
        <div className="create-workspace-overlay">
          <form
            className="create-workspace-form"
            onSubmit={async (event) => {
              event.preventDefault();

              const newTitle = editTaskTitle.trim();

              if (!newTitle || !selectedBoard) {
                return;
              }

              try {
                await api.patch(
                  `/workspaces/${selectedBoard.workspaceId}/tasks/${editingTask.id}`,
                  {
                    title: newTitle,
                    version: editingTask.version,
                  }
                );

                setEditingTask(null);
                setEditTaskTitle("");
              } catch {
                setMessage("Could not edit task");
                setMessageType("error");
              }
            }}
          >
            <h2 className="section-title">Edit Task</h2>

            <input
              type="text"
              value={editTaskTitle}
              onChange={(event) =>
                setEditTaskTitle(event.target.value)
              }
              autoFocus
            />

            <button type="submit">
              Save Changes
            </button>

            <button
              type="button"
              className="cancel-workspace"
              onClick={() => {
                setEditingTask(null);
                setEditTaskTitle("");
              }}
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {workspaces.length > 0 && (
        <div className="workspace-section">

          <div className="workspace-header">
            <h2 className="section-title">Your Workspaces</h2>

            <div className="workspace-selector">
              <button
                type="button"
                className="create-workspace-action"
                onClick={() => setShowCreateWorkspace(true)}
              >
                + Create Workspace
              </button>
              {workspaces.map((workspace) => (
                <div key={workspace.id}>
                  <button
                    className={
                      selectedBoard?.workspaceId === workspace.id
                        ? "workspace-button active"
                        : "workspace-button"
                    }
                    onClick={() => loadBoard(workspace.id)}
                  >
                    {workspace.name}
                  </button>
                </div>
              ))}
              {message && (
                <p
                  ref={statusMessageRef}
                  className={`status-message ${messageType}`}
                >
                  <StatusIcon type={messageType} />
                  <span>{message}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {deletingTask && (
        <div className="create-workspace-overlay">
          <form
            className="create-workspace-form delete-task-form"
            onSubmit={async (event) => {
              event.preventDefault();

              if (!selectedBoard) {
                return;
              }

              try {
                await api.delete(
                  `/workspaces/${selectedBoard.workspaceId}/tasks/${deletingTask.id}`
                );

                setDeletingTask(null);
              } catch {
                setMessage("Could not delete task");
                setMessageType("error");
              }
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#dc2626"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="delete-task-icon"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" x2="12" y1="8" y2="12" />
              <line x1="12" x2="12.01" y1="16" y2="16" />
            </svg>

            <h2 className="section-title delete-task-heading">Delete Task</h2>

            <p className="delete-task-message">
              Are you sure you want to delete "{deletingTask.title}"?
            </p>

            <button type="submit" className="delete-task-button">
              Delete Task
            </button>

            <button
              type="button"
              className="cancel-workspace"
              onClick={() => {
                setDeletingTask(null);
              }}
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {selectedBoard && (
        <DndContext
          sensors={sensors}
          onDragEnd={handleDragEnd}
          autoScroll={false}
        >
          <div className="board-content">
            <div className="toolbar">
              <div className="task-search-input">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m21 21-4.34-4.34" />
                  <circle cx="11" cy="11" r="8" />
                </svg>

                <input
                  type="text"
                  placeholder="Search tasks..."
                  value={searchTerm}
                  onChange={(event) =>
                    setSearchTerm(event.target.value)
                  }
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
              >
                <option value="">All Statuses</option>
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="DONE">Done</option>
              </select>

              <select
                value={assigneeFilter}
                onChange={(event) =>
                  setAssigneeFilter(event.target.value)
                }
              >
                <option value="">All Assignees</option>

                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>

              <select
                value={labelFilter}
                onChange={(event) =>
                  setLabelFilter(event.target.value)
                }
              >
                <option value="">All Labels</option>

                {labels.map((label) => (
                  <option key={label.id} value={label.id}>
                    {label.name}
                  </option>
                ))}
              </select>

              <button onClick={searchTasks}>
                Search
              </button>
            </div>

            <div className="board-header">
              <div>
                <h2 className="board-title">{selectedBoard.name}</h2>
                <p className="board-subtitle">
                  Manage tasks and track progress
                </p>
              </div>

              <button
                onClick={() => {
                  if (showActivity) {
                    setShowActivity(false);
                  } else {
                    loadActivity(selectedBoard.workspaceId);
                  }
                }}
              >
                {showActivity ? "Hide Activity" : "View Activity"}
              </button>
            </div>

            {showActivity && (
              <div className="activity-panel">
                <h3>Recent Activity</h3>

                {activityLogs.length === 0 ? (
                  <p>No activity found.</p>
                ) : (
                  activityLogs.map((log) => (
                    <div className="activity-item" key={log.id}>
                      <ActivityIcon action={log.action} />

                      <div className="activity-content">
                        <strong>
                          {log.action === "TASK_MOVED"
                            ? "Task moved"
                            : log.action === "TASK_DELETED"
                              ? "Task deleted"
                              : log.action === "TASK_CREATED"
                                ? "Task created"
                                : log.action === "TASK_UPDATED"
                                  ? "Task updated"
                                  : log.action === "INVITE_CREATED"
                                    ? "Invite created"
                                    : log.action}
                        </strong>

                      </div>

                      <small>
                        {new Date(log.createdAt).toLocaleString()}
                      </small>
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="members-panel">
              <h3>Workspace Members</h3>

              {members.map((member) => (
                <div className="member-row" key={member.id}>
                  <div className="member-info">
                    <strong>{member.name}</strong>
                    <span>{member.email}</span>
                  </div>

                  <div className="member-role">

                    {member.role !== "OWNER" && (
                      <select
                        value={member.role}
                        onChange={async (event) => {
                          try {
                            await api.patch(
                              `/workspaces/${selectedBoard.workspaceId}/members/${member.id}/role`,
                              {
                                role: event.target.value,
                              }
                            );

                            await loadMembers(selectedBoard.workspaceId);
                            setMessage("Member role updated");
                          } catch {
                            setMessage("Could not update member role");
                            setMessageType("error");
                          }
                        }}
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="MEMBER">Member</option>
                        <option value="VIEWER">Viewer</option>
                      </select>
                    )}
                  </div>
                </div>
              ))}

            </div>

            <div className="invite-section">
              <h3>Invite Member</h3>

              <div className="invite-controls">
                <input
                  type="email"
                  placeholder="Member email"
                  value={inviteEmail}
                  onChange={(event) =>
                    setInviteEmail(event.target.value)
                  }
                />

                <select
                  value={inviteRole}
                  onChange={(event) =>
                    setInviteRole(event.target.value)
                  }
                >
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                  <option value="VIEWER">Viewer</option>
                </select>

                <button
                  onClick={async () => {
                    if (!inviteEmail.trim() || !selectedBoard) {
                      return;
                    }

                    try {
                      await api.post(
                        `/workspaces/${selectedBoard.workspaceId}/invites`,
                        {
                          email: inviteEmail.trim(),
                          role: inviteRole,
                        }
                      );

                      setInviteEmail("");
                      setMessage("Invitation created successfully");
                      setMessageType("success");

                      setTimeout(() => {
                        statusMessageRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                      }, 0);
                    } catch {
                      setMessage("Could not create invitation");
                      setMessageType("error");

                      setTimeout(() => {
                        statusMessageRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                      }, 0);
                    }
                  }}
                >
                  Invite
                </button>
              </div>
            </div>

            <div className="kanban-board">
              {selectedBoard.lists.map((list) => (
                <DroppableList key={list.id} listId={list.id}>
                  <div className="column-header">
                    <div className="column-title">
                      <h3>{list.name}</h3>
                      <span>{list.tasks.length}</span>
                    </div>

                    {list.name === "To Do" && (
                      <button onClick={() => createTask(list.id)}>
                        + Add Task
                      </button>
                    )}
                  </div>

                  {list.tasks.length === 0 && (
                    <div className="empty-column">
                      No tasks yet
                    </div>
                  )}

                  {list.tasks.map((task) => (
                    <DraggableTask key={task.id} task={task}>
                      <div className="task-card">
                        <strong className="task-title">{task.title}</strong>

                        <p>{task.description}</p>

                        <select
                          value={task.assigneeId ?? ""}
                          onChange={async (event) => {
                            const assigneeId =
                              event.target.value || null;

                            try {
                              await api.patch(
                                `/workspaces/${selectedBoard.workspaceId}/tasks/${task.id}/assignee`,
                                {
                                  assigneeId,
                                }
                              );
                            } catch {
                              setMessage(
                                "Could not assign task"
                              );
                              setMessageType("error");
                            }
                          }}
                        >
                          <option value="">
                            Unassigned
                          </option>

                          {members.map((member) => (
                            <option
                              key={member.id}
                              value={member.id}
                            >
                              {member.name} ({member.email})
                            </option>
                          ))}
                        </select>

                        <button
                          onClick={() => {
                            setEditingTask(task);
                            setEditTaskTitle(task.title);
                          }}
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => {
                            setDeletingTask(task);
                          }}
                        >
                          Delete
                        </button>

                        <button
                          onClick={async () => {
                            const currentListIndex =
                              selectedBoard.lists.findIndex(
                                (currentList) =>
                                  currentList.id === list.id
                              );

                            const nextList =
                              selectedBoard.lists[
                              currentListIndex + 1
                              ];

                            if (!nextList) {
                              return;
                            }

                            try {
                              await api.patch(
                                `/workspaces/${selectedBoard.workspaceId}/tasks/${task.id}/move`,
                                {
                                  targetListId: nextList.id,
                                  targetPosition:
                                    nextList.tasks.length + 1,
                                }
                              );
                            } catch {
                              setMessage(
                                "Could not move task"
                              );
                              setMessageType("error");
                            }
                          }}
                        >
                          Move Right →
                        </button>

                        <button
                          onClick={async () => {
                            const currentListIndex =
                              selectedBoard.lists.findIndex(
                                (currentList) =>
                                  currentList.id === list.id
                              );

                            const previousList =
                              selectedBoard.lists[
                              currentListIndex - 1
                              ];

                            if (!previousList) {
                              return;
                            }

                            try {
                              await api.patch(
                                `/workspaces/${selectedBoard.workspaceId}/tasks/${task.id}/move`,
                                {
                                  targetListId:
                                    previousList.id,
                                  targetPosition:
                                    previousList.tasks.length + 1,
                                }
                              );
                            } catch {
                              setMessage(
                                "Could not move task"
                              );
                              setMessageType("error");
                            }
                          }}
                        >
                          ← Move Left
                        </button>
                      </div>
                    </DraggableTask>
                  ))}
                </DroppableList>
              ))}
            </div>
          </div>
        </DndContext>
      )}
    </div>
  );
}

export default App;