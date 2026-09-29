import { describe, expect, it } from "vitest";
import { request, app, createUser, PASSWORD } from "./helpers";

const cookieValue = (setCookie: string[]) =>
  setCookie[0]!.split(";")[0]!; // "refreshToken=<jwt>"

describe("auth", () => {
  it("rejects duplicate registration with 409", async () => {
    const user = await createUser("dup");
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "x", email: user.email, password: PASSWORD });
    expect(res.status).toBe(409);
  });

  it("validates registration input", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "x", email: "not-an-email", password: "short" });
    expect(res.status).toBe(400);
  });

  it("rejects bad credentials with 401 and never returns the hash", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.test", password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("rejects requests without / with a bad access token", async () => {
    expect((await request(app).get("/api/workspaces")).status).toBe(401);
    expect(
      (
        await request(app)
          .get("/api/workspaces")
          .set("Authorization", "Bearer garbage")
      ).status
    ).toBe(401);
  });

  it("rotates refresh tokens and rejects reuse of the old one", async () => {
    const user = await createUser("refresh");
    const original = cookieValue(user.cookies);

    const first = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", original);
    expect(first.status).toBe(200);
    expect(first.body.accessToken).toBeTruthy();

    const rotated = cookieValue(first.headers["set-cookie"] as unknown as string[]);
    expect(rotated).not.toBe(original);

    // Replaying the old token fails...
    const replay = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", original);
    expect(replay.status).toBe(401);

    // ...and reuse detection revokes the whole family, including the new token.
    const afterReuse = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", rotated);
    expect(afterReuse.status).toBe(401);
  });

  it("logout revokes the refresh token", async () => {
    const user = await createUser("logout");
    const cookie = cookieValue(user.cookies);

    expect(
      (await request(app).post("/api/auth/logout").set("Cookie", cookie)).status
    ).toBe(200);

    expect(
      (await request(app).post("/api/auth/refresh").set("Cookie", cookie)).status
    ).toBe(401);
  });
});
