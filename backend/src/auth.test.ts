import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "./server";
import prisma from "./lib/prisma";

describe("Authentication", () => {
    it("should reject login with invalid credentials", async () => {
        const response = await request(app)
            .post("/api/auth/login")
            .send({
                email: "wrong@example.com",
                password: "wrong-password",
            });

        expect(response.status).toBe(401);
    });
    it("should reject access to a workspace the user does not belong to", async () => {
        const loginResponse = await request(app)
            .post("/api/auth/login")
            .send({
                email: "test@example.com",
                password: "Test@12345",
            });

        expect(loginResponse.status).toBe(200);

        const accessToken = loginResponse.body.accessToken;

        const response = await request(app)
            .get(
                "/api/workspaces/00000000-0000-0000-0000-000000000001/test-access"
            )
            .set("Authorization", `Bearer ${accessToken}`);

        expect(response.status).toBe(403);
    });
    it("should reject a task update with a stale version", async () => {
        const loginResponse = await request(app)
            .post("/api/auth/login")
            .send({
                email: "test@example.com",
                password: "Test@12345",
            });

        expect(loginResponse.status).toBe(200);

        const accessToken = loginResponse.body.accessToken;

        const workspaceId =
            "9434a92f-4742-45a0-a48c-84774f451f4e";

        const listId =
            "cf5479b6-dfc9-410f-b114-b52a482ecef4";

        const createResponse = await request(app)
            .post(
                `/api/workspaces/${workspaceId}/lists/${listId}/tasks`
            )
            .set("Authorization", `Bearer ${accessToken}`)
            .send({
                title: "Concurrency Test Task",
                description: "Testing stale task versions",
            });

        expect(createResponse.status).toBe(201);

        const task = createResponse.body.task;

        const updateResponse = await request(app)
            .patch(
                `/api/workspaces/${workspaceId}/tasks/${task.id}`
            )
            .set("Authorization", `Bearer ${accessToken}`)
            .send({
                title: "Updated Once",
                version: task.version,
            });

        expect(updateResponse.status).toBe(200);

        const staleUpdateResponse = await request(app)
            .patch(
                `/api/workspaces/${workspaceId}/tasks/${task.id}`
            )
            .set("Authorization", `Bearer ${accessToken}`)
            .send({
                title: "Stale Update",
                version: task.version,
            });

        expect(staleUpdateResponse.status).toBe(409);
    });
    it("should prevent a viewer from updating a task", async () => {
        const loginResponse = await request(app)
            .post("/api/auth/login")
            .send({
                email: "test@example.com",
                password: "Test@12345",
            });

        expect(loginResponse.status).toBe(200);

        const accessToken = loginResponse.body.accessToken;

        const workspaceId = "9434a92f-4742-45a0-a48c-84774f451f4e";
        const listId = "cf5479b6-dfc9-410f-b114-b52a482ecef4";

        const createResponse = await request(app)
            .post(`/api/workspaces/${workspaceId}/lists/${listId}/tasks`)
            .set("Authorization", `Bearer ${accessToken}`)
            .send({
                title: "Viewer RBAC Test Task",
            });

        expect(createResponse.status).toBe(201);

        const task = createResponse.body.task;

        const viewerEmail = `viewer-${Date.now()}@example.com`;

        const registerResponse = await request(app)
            .post("/api/auth/register")
            .send({
                name: "Viewer User",
                email: viewerEmail,
                password: "Viewer@12345",
            });

        expect(registerResponse.status).toBe(201);

        const viewerLogin = await request(app)
            .post("/api/auth/login")
            .send({
                email: viewerEmail,
                password: "Viewer@12345",
            });

        expect(viewerLogin.status).toBe(200);

        const viewerToken = viewerLogin.body.accessToken;

        const viewerUser = await prisma.user.findUnique({
            where: { email: viewerEmail },
        });

        expect(viewerUser).not.toBeNull();

        await prisma.membership.create({
            data: {
                userId: viewerUser!.id,
                workspaceId,
                role: "VIEWER",
            },
        });

        const viewerUpdateResponse = await request(app)
            .patch(
                `/api/workspaces/${workspaceId}/tasks/${task.id}`
            )
            .set("Authorization", `Bearer ${viewerToken}`)
            .send({
                title: "Viewer Should Not Update",
                version: task.version,
            });

        expect(viewerUpdateResponse.status).toBe(403);
    });
});