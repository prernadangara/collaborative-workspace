import request from "supertest";
import { randomUUID } from "crypto";
import { app } from "../server";
import prisma from "../lib/prisma";

export const PASSWORD = "Test@12345";

export type TestUser = {
  id: string;
  email: string;
  token: string;
  cookies: string[];
};

export async function createUser(label = "user"): Promise<TestUser> {
  const email = `${label}-${randomUUID()}@example.test`;

  const reg = await request(app)
    .post("/api/auth/register")
    .send({ name: label, email, password: PASSWORD });
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status}`);

  const login = await request(app)
    .post("/api/auth/login")
    .send({ email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`login failed: ${login.status}`);

  return {
    id: login.body.user.id,
    email,
    token: login.body.accessToken,
    cookies: login.headers["set-cookie"] as unknown as string[],
  };
}

export const auth = (user: TestUser) => ({
  Authorization: `Bearer ${user.token}`,
});

/** Owner + workspace + board + list, built through the real API. */
export async function createWorkspaceFixture() {
  const owner = await createUser("owner");

  const ws = await request(app)
    .post("/api/workspaces")
    .set(auth(owner))
    .send({ name: `WS ${randomUUID().slice(0, 6)}` });
  const workspaceId: string = ws.body.workspace.id;

  const board = await request(app)
    .post(`/api/workspaces/${workspaceId}/boards`)
    .set(auth(owner))
    .send({ name: "Board" });
  const boardId: string = board.body.board.id;

  const list = await request(app)
    .post(`/api/workspaces/${workspaceId}/boards/${boardId}/lists`)
    .set(auth(owner))
    .send({ name: "To Do" });
  const listId: string = list.body.list.id;

  return { owner, workspaceId, boardId, listId };
}

/** Adds an existing user to a workspace with a role (bypasses invites). */
export async function addMember(
  workspaceId: string,
  user: TestUser,
  role: "ADMIN" | "MEMBER" | "VIEWER"
) {
  await prisma.membership.create({
    data: { userId: user.id, workspaceId, role },
  });
}

export async function createTask(
  user: TestUser,
  workspaceId: string,
  listId: string,
  title = "Task"
) {
  const res = await request(app)
    .post(`/api/workspaces/${workspaceId}/lists/${listId}/tasks`)
    .set(auth(user))
    .send({ title });
  return res;
}

export { request, app, prisma };
