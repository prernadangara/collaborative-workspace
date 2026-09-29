import { describe, expect, it } from "vitest";
import {
  request,
  app,
  prisma,
  auth,
  addMember,
  createUser,
  createTask,
  createWorkspaceFixture,
} from "./helpers";

describe("workspace isolation", () => {
  it("blocks non-members from reading or writing another workspace", async () => {
    const a = await createWorkspaceFixture();
    const outsider = await createUser("outsider");
    const task = (await createTask(a.owner, a.workspaceId, a.listId)).body.task;

    const base = `/api/workspaces/${a.workspaceId}`;
    const attempts = [
      request(app).get(`${base}/boards`).set(auth(outsider)),
      request(app).get(`${base}/boards/${a.boardId}`).set(auth(outsider)),
      request(app).get(`${base}/tasks`).set(auth(outsider)),
      request(app).get(`${base}/activity`).set(auth(outsider)),
      request(app).get(`${base}/members`).set(auth(outsider)),
      request(app).get(`${base}/summary`).set(auth(outsider)),
      request(app)
        .post(`${base}/lists/${a.listId}/tasks`)
        .set(auth(outsider))
        .send({ title: "hax" }),
      request(app)
        .delete(`${base}/tasks/${task.id}`)
        .set(auth(outsider)),
    ];

    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(403);
    }
  });

  it("does not let workspace B's URL reach workspace A's task (IDOR)", async () => {
    const a = await createWorkspaceFixture();
    const b = await createWorkspaceFixture();
    const task = (await createTask(a.owner, a.workspaceId, a.listId)).body.task;

    // B's owner is a legit member of B, but the task belongs to A.
    const del = await request(app)
      .delete(`/api/workspaces/${b.workspaceId}/tasks/${task.id}`)
      .set(auth(b.owner));
    expect(del.status).toBe(404);

    const move = await request(app)
      .patch(`/api/workspaces/${b.workspaceId}/tasks/${task.id}/move`)
      .set(auth(b.owner))
      .send({ targetListId: b.listId, targetPosition: 1 });
    expect(move.status).toBe(404);

    // Still exists in A.
    expect(await prisma.task.count({ where: { id: task.id } })).toBe(1);
  });

  it("does not allow moving a task into another workspace's list", async () => {
    const a = await createWorkspaceFixture();
    const b = await createWorkspaceFixture();
    const task = (await createTask(a.owner, a.workspaceId, a.listId)).body.task;

    const res = await request(app)
      .patch(`/api/workspaces/${a.workspaceId}/tasks/${task.id}/move`)
      .set(auth(a.owner))
      .send({ targetListId: b.listId, targetPosition: 1 });
    expect(res.status).toBe(404);
  });

  it("lists only the caller's workspaces", async () => {
    const a = await createWorkspaceFixture();
    const b = await createWorkspaceFixture();
    const res = await request(app).get("/api/workspaces").set(auth(a.owner));
    const ids = res.body.workspaces.map((w: { id: string }) => w.id);
    expect(ids).toContain(a.workspaceId);
    expect(ids).not.toContain(b.workspaceId);
  });
});

describe("role-based access control", () => {
  it("viewer is read-only on every mutating task endpoint", async () => {
    const f = await createWorkspaceFixture();
    const viewer = await createUser("viewer");
    await addMember(f.workspaceId, viewer, "VIEWER");
    const task = (await createTask(f.owner, f.workspaceId, f.listId)).body.task;
    const base = `/api/workspaces/${f.workspaceId}`;

    expect(
      (await request(app).get(`${base}/boards/${f.boardId}`).set(auth(viewer))).status
    ).toBe(200);

    const writes = await Promise.all([
      createTask(viewer, f.workspaceId, f.listId),
      request(app)
        .patch(`${base}/tasks/${task.id}`)
        .set(auth(viewer))
        .send({ title: "x", version: task.version }),
      request(app)
        .patch(`${base}/tasks/${task.id}/move`)
        .set(auth(viewer))
        .send({ targetListId: f.listId, targetPosition: 1 }),
      request(app).delete(`${base}/tasks/${task.id}`).set(auth(viewer)),
      request(app).post(`${base}/boards`).set(auth(viewer)).send({ name: "b" }),
    ]);
    for (const res of writes) expect(res.status).toBe(403);
  });

  it("member cannot invite or manage members", async () => {
    const f = await createWorkspaceFixture();
    const member = await createUser("member");
    const other = await createUser("other");
    await addMember(f.workspaceId, member, "MEMBER");
    await addMember(f.workspaceId, other, "VIEWER");
    const base = `/api/workspaces/${f.workspaceId}`;

    expect(
      (
        await request(app)
          .post(`${base}/invites`)
          .set(auth(member))
          .send({ email: "x@example.test" })
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch(`${base}/members/${other.id}/role`)
          .set(auth(member))
          .send({ role: "ADMIN" })
      ).status
    ).toBe(403);
    expect(
      (await request(app).delete(`${base}/members/${other.id}`).set(auth(member))).status
    ).toBe(403);
  });

  it("admin cannot change/remove another admin or the owner, or grant ADMIN", async () => {
    const f = await createWorkspaceFixture();
    const admin1 = await createUser("admin1");
    const admin2 = await createUser("admin2");
    const member = await createUser("member");
    await addMember(f.workspaceId, admin1, "ADMIN");
    await addMember(f.workspaceId, admin2, "ADMIN");
    await addMember(f.workspaceId, member, "MEMBER");
    const base = `/api/workspaces/${f.workspaceId}`;

    const put = (uid: string, role: string) =>
      request(app)
        .patch(`${base}/members/${uid}/role`)
        .set(auth(admin1))
        .send({ role });

    expect((await put(admin2.id, "VIEWER")).status).toBe(403);
    expect((await put(f.owner.id, "VIEWER")).status).toBe(403);
    expect((await put(member.id, "ADMIN")).status).toBe(403);
    expect((await put(member.id, "VIEWER")).status).toBe(200);
    expect(
      (await request(app).delete(`${base}/members/${admin2.id}`).set(auth(admin1))).status
    ).toBe(403);
  });

  it("owner can change roles, and it is written to the activity log", async () => {
    const f = await createWorkspaceFixture();
    const member = await createUser("member");
    await addMember(f.workspaceId, member, "MEMBER");
    const base = `/api/workspaces/${f.workspaceId}`;

    const res = await request(app)
      .patch(`${base}/members/${member.id}/role`)
      .set(auth(f.owner))
      .send({ role: "ADMIN" });
    expect(res.status).toBe(200);

    const rm = await request(app)
      .delete(`${base}/members/${member.id}`)
      .set(auth(f.owner));
    expect(rm.status).toBe(200);

    const activity = await request(app).get(`${base}/activity`).set(auth(f.owner));
    const actions = activity.body.logs.map((l: { action: string }) => l.action);
    expect(actions).toContain("ROLE_CHANGED");
    expect(actions).toContain("MEMBER_REMOVED");

    // Removed member loses access immediately.
    expect(
      (await request(app).get(`${base}/boards`).set(auth(member))).status
    ).toBe(403);
  });

  it("invite flow: only the invited email can accept, once", async () => {
    const f = await createWorkspaceFixture();
    const invitee = await createUser("invitee");
    const stranger = await createUser("stranger");
    const base = `/api/workspaces/${f.workspaceId}`;

    const invite = await request(app)
      .post(`${base}/invites`)
      .set(auth(f.owner))
      .send({ email: invitee.email, role: "MEMBER" });
    expect(invite.status).toBe(201);
    const token: string = invite.body.token;

    expect(
      (await request(app).post("/api/invites/accept").set(auth(stranger)).send({ token }))
        .status
    ).toBe(400);
    expect(
      (await request(app).post("/api/invites/accept").set(auth(invitee)).send({ token }))
        .status
    ).toBe(200);
    expect(
      (await request(app).post("/api/invites/accept").set(auth(invitee)).send({ token }))
        .status
    ).toBe(400);
  });
});
