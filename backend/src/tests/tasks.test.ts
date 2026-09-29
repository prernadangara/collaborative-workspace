import { describe, expect, it } from "vitest";
import {
  request,
  app,
  prisma,
  auth,
  createTask,
  createWorkspaceFixture,
  createUser,
  addMember,
} from "./helpers";

describe("task mutations", () => {
  it("creates, updates, and deletes a task; rejects stale versions with 409", async () => {
    const f = await createWorkspaceFixture();
    const base = `/api/workspaces/${f.workspaceId}`;

    const created = await createTask(f.owner, f.workspaceId, f.listId, "First");
    expect(created.status).toBe(201);
    const task = created.body.task;

    const ok = await request(app)
      .patch(`${base}/tasks/${task.id}`)
      .set(auth(f.owner))
      .send({ title: "Renamed", version: task.version });
    expect(ok.status).toBe(200);
    expect(ok.body.task.version).toBe(task.version + 1);

    const stale = await request(app)
      .patch(`${base}/tasks/${task.id}`)
      .set(auth(f.owner))
      .send({ title: "Stale", version: task.version });
    expect(stale.status).toBe(409);

    expect(
      (await request(app).delete(`${base}/tasks/${task.id}`).set(auth(f.owner))).status
    ).toBe(200);
    expect(await prisma.task.count({ where: { id: task.id } })).toBe(0);
  });

  it("validates input", async () => {
    const f = await createWorkspaceFixture();
    const res = await request(app)
      .post(`/api/workspaces/${f.workspaceId}/lists/${f.listId}/tasks`)
      .set(auth(f.owner))
      .send({ title: "   " });
    expect(res.status).toBe(400);
  });

  it("assigning to a non-member is rejected", async () => {
    const f = await createWorkspaceFixture();
    const outsider = await createUser("outsider");
    const task = (await createTask(f.owner, f.workspaceId, f.listId)).body.task;
    const res = await request(app)
      .patch(`/api/workspaces/${f.workspaceId}/tasks/${task.id}/assignee`)
      .set(auth(f.owner))
      .send({ assigneeId: outsider.id });
    expect(res.status).toBe(400);
  });
});

describe("ordering", () => {
  const positions = async (listId: string) =>
    (
      await prisma.task.findMany({ where: { listId }, orderBy: { position: "asc" } })
    ).map((t) => t.title);

  it("moves a task within a list and keeps positions contiguous", async () => {
    const f = await createWorkspaceFixture();
    const base = `/api/workspaces/${f.workspaceId}`;
    const [a, b, c] = [
      (await createTask(f.owner, f.workspaceId, f.listId, "A")).body.task,
      (await createTask(f.owner, f.workspaceId, f.listId, "B")).body.task,
      (await createTask(f.owner, f.workspaceId, f.listId, "C")).body.task,
    ];

    const move = await request(app)
      .patch(`${base}/tasks/${c.id}/move`)
      .set(auth(f.owner))
      .send({ targetListId: f.listId, targetPosition: a.position });
    expect(move.status).toBe(200);

    expect(await positions(f.listId)).toEqual(["C", "A", "B"]);
    void b;
  });

  it("moves a task across lists and closes the gap in the source list", async () => {
    const f = await createWorkspaceFixture();
    const base = `/api/workspaces/${f.workspaceId}`;
    const list2 = (
      await request(app)
        .post(`${base}/boards/${f.boardId}/lists`)
        .set(auth(f.owner))
        .send({ name: "Done" })
    ).body.list;

    const a = (await createTask(f.owner, f.workspaceId, f.listId, "A")).body.task;
    await createTask(f.owner, f.workspaceId, f.listId, "B");
    await createTask(f.owner, f.workspaceId, list2.id, "X");

    await request(app)
      .patch(`${base}/tasks/${a.id}/move`)
      .set(auth(f.owner))
      .send({ targetListId: list2.id, targetPosition: 1 });

    expect(await positions(f.listId)).toEqual(["B"]);
    expect(await positions(list2.id)).toEqual(["A", "X"]);
  });

  it("concurrent creates in one list get unique positions", async () => {
    const f = await createWorkspaceFixture();
    const members = await Promise.all(
      [1, 2, 3].map(async () => {
        const u = await createUser("m");
        await addMember(f.workspaceId, u, "MEMBER");
        return u;
      })
    );

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        createTask(members[i % 3]!, f.workspaceId, f.listId, `T${i}`)
      )
    );
    expect(results.every((r) => r.status === 201)).toBe(true);

    const rows = await prisma.task.findMany({ where: { listId: f.listId } });
    expect(rows).toHaveLength(12);
    expect(new Set(rows.map((r) => r.position)).size).toBe(12);
  });

  it("concurrent moves never produce duplicate positions", async () => {
    const f = await createWorkspaceFixture();
    const base = `/api/workspaces/${f.workspaceId}`;
    const tasks = [];
    for (let i = 0; i < 6; i++) {
      tasks.push((await createTask(f.owner, f.workspaceId, f.listId, `T${i}`)).body.task);
    }

    await Promise.all(
      tasks.map((t, i) =>
        request(app)
          .patch(`${base}/tasks/${t.id}/move`)
          .set(auth(f.owner))
          .send({ targetListId: f.listId, targetPosition: (i * 2) % 6 + 1 })
      )
    );

    const rows = await prisma.task.findMany({ where: { listId: f.listId } });
    expect(rows).toHaveLength(6);
    expect(new Set(rows.map((r) => r.position)).size).toBe(6);
  });
});

describe("search, filters, pagination", () => {
  it("filters by text, status, assignee and label, and paginates", async () => {
    const f = await createWorkspaceFixture();
    const base = `/api/workspaces/${f.workspaceId}`;
    const member = await createUser("assignee");
    await addMember(f.workspaceId, member, "MEMBER");

    const t1 = (await createTask(f.owner, f.workspaceId, f.listId, "Fix login bug")).body.task;
    const t2 = (await createTask(f.owner, f.workspaceId, f.listId, "Write docs")).body.task;
    for (let i = 0; i < 4; i++) await createTask(f.owner, f.workspaceId, f.listId, `Filler ${i}`);

    await request(app)
      .patch(`${base}/tasks/${t1.id}/assignee`)
      .set(auth(f.owner))
      .send({ assigneeId: member.id });
    await request(app)
      .patch(`${base}/tasks/${t2.id}`)
      .set(auth(f.owner))
      .send({ status: "DONE", version: t2.version });

    const label = (
      await request(app).post(`${base}/labels`).set(auth(f.owner)).send({ name: "bug" })
    ).body.label;
    await request(app)
      .post(`${base}/tasks/${t1.id}/labels/${label.id}`)
      .set(auth(f.owner));

    const q = async (qs: string) =>
      (await request(app).get(`${base}/tasks?${qs}`).set(auth(f.owner))).body;

    expect((await q("search=LOGIN")).tasks.map((t: { id: string }) => t.id)).toEqual([t1.id]);
    expect((await q("status=DONE")).tasks.map((t: { id: string }) => t.id)).toEqual([t2.id]);
    expect((await q(`assigneeId=${member.id}`)).tasks).toHaveLength(1);
    expect((await q(`labelId=${label.id}`)).tasks.map((t: { id: string }) => t.id)).toEqual([t1.id]);

    const page = await q("limit=2&page=2");
    expect(page.tasks).toHaveLength(2);
    expect(page.pagination.total).toBe(6);
    expect(page.pagination.totalPages).toBe(3);
  });

  it("does not leak labels across workspaces", async () => {
    const a = await createWorkspaceFixture();
    const b = await createWorkspaceFixture();
    const label = (
      await request(app)
        .post(`/api/workspaces/${a.workspaceId}/labels`)
        .set(auth(a.owner))
        .send({ name: "secret" })
    ).body.label;
    const task = (await createTask(b.owner, b.workspaceId, b.listId)).body.task;

    const res = await request(app)
      .post(`/api/workspaces/${b.workspaceId}/tasks/${task.id}/labels/${label.id}`)
      .set(auth(b.owner));
    expect(res.status).toBe(404);
  });
});

describe("activity log and summary cache", () => {
  it("records task mutations with actor and action", async () => {
    const f = await createWorkspaceFixture();
    const base = `/api/workspaces/${f.workspaceId}`;
    const t = (await createTask(f.owner, f.workspaceId, f.listId)).body.task;
    await request(app).delete(`${base}/tasks/${t.id}`).set(auth(f.owner));

    const res = await request(app).get(`${base}/activity`).set(auth(f.owner));
    const entries = res.body.logs as { action: string; userId: string }[];
    expect(entries.map((e) => e.action)).toEqual(
      expect.arrayContaining(["TASK_CREATED", "TASK_DELETED"])
    );
    expect(entries.every((e) => e.userId)).toBe(true);
  });

  it("summary is cached and invalidated by mutations", async () => {
    const f = await createWorkspaceFixture();
    const base = `/api/workspaces/${f.workspaceId}`;
    const get = async () =>
      (await request(app).get(`${base}/summary`).set(auth(f.owner))).body;

    const first = await get();
    expect(first.cached).toBe(false);
    expect((await get()).cached).toBe(true);

    await createTask(f.owner, f.workspaceId, f.listId);

    const after = await get();
    expect(after.cached).toBe(false);
    expect(after.tasksByStatus.TODO).toBe(1);
  });
});
