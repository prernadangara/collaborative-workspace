import { useEffect, useState } from "react";
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
      style={{
        minHeight: "100px",
        border: isOver
          ? "2px dashed black"
          : "2px solid transparent",
      }}
    >
      {children}
    </div>
  );
}

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
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
    }
  }

  async function loadWorkspaces() {
    try {
      const response = await api.get("/workspaces");
      setWorkspaces(response.data.workspaces);
    } catch {
      setMessage("Could not load workspaces");
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
    <div>
      <h1>Collaborative Workspace</h1>

      {!localStorage.getItem("accessToken") && (
        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
          />

          <button type="submit">Login</button>
        </form>
      )}

      {message && <p>{message}</p>}

      {workspaces.length > 0 && (
        <div>
          <h2>Your Workspaces</h2>

          {workspaces.map((workspace) => (
            <div key={workspace.id}>
              <button
                onClick={() => loadBoard(workspace.id)}
              >
                {workspace.name}
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedBoard && (
        <DndContext
          sensors={sensors}
          onDragEnd={handleDragEnd}
        >
          <div>
            <div>
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchTerm}
                onChange={(event) =>
                  setSearchTerm(event.target.value)
                }
              />
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

            <button
              onClick={() =>
                loadActivity(selectedBoard.workspaceId)
              }
            >
              View Activity
            </button>

            {showActivity && (
              <div>
                <h3>Recent Activity</h3>

                {activityLogs.length === 0 ? (
                  <p>No activity found.</p>
                ) : (
                  activityLogs.map((log) => (
                    <div key={log.id}>
                      <strong>{log.action}</strong>
                      <span>
                        {" "}
                        — {log.entityType}
                      </span>
                      <small>
                        {" "}
                        {new Date(
                          log.createdAt
                        ).toLocaleString()}
                      </small>
                    </div>
                  ))
                )}
              </div>
            )}

            <h2>{selectedBoard.name}</h2>

            <h3>Workspace Members</h3>

            {members.map((member) => (
              <div key={member.id}>
                {member.name} — {member.email} — {member.role}

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
                      }
                    }}
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="MEMBER">Member</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                )}
              </div>
            ))}

            <h3>Invite Member</h3>

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
                } catch {
                  setMessage("Could not create invitation");
                }
              }}
            >
              Invite
            </button>

            {selectedBoard.lists.map((list) => (
              <DroppableList key={list.id} listId={list.id}>
                <h3>{list.name}</h3>

                <button onClick={() => createTask(list.id)}>
                  + Add Task
                </button>

                {list.tasks.map((task) => (
                  <DraggableTask key={task.id} task={task}>
                    <div>
                      <strong>{task.title}</strong>

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
                          const newTitle = window.prompt(
                            "Enter new task title:",
                            task.title
                          );

                          if (
                            !newTitle ||
                            !newTitle.trim()
                          ) {
                            return;
                          }

                          api.patch(
                            `/workspaces/${selectedBoard.workspaceId}/tasks/${task.id}`,
                            {
                              title: newTitle.trim(),
                              version: task.version,
                            }
                          );
                        }}
                      >
                        Edit
                      </button>

                      <button
                        onClick={async () => {
                          await api.delete(
                            `/workspaces/${selectedBoard.workspaceId}/tasks/${task.id}`
                          );
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
        </DndContext>
      )}
    </div>
  );
}

export default App;