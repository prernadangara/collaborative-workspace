import "dotenv/config";
import bcrypt from "bcrypt";
import prisma from "./lib/prisma";

async function main() {
  const ownerPassword = "Owner@123";
  const memberPassword = "Member@123";

  const ownerHash = await bcrypt.hash(ownerPassword, 12);
  const memberHash = await bcrypt.hash(memberPassword, 12);

  const owner = await prisma.user.upsert({
    where: { email: "owner@example.com" },
    update: {
      passwordHash: ownerHash,
      name: "Demo Owner",
    },
    create: {
      email: "owner@example.com",
      passwordHash: ownerHash,
      name: "Demo Owner",
    },
  });

  const member = await prisma.user.upsert({
    where: { email: "member@example.com" },
    update: {
      passwordHash: memberHash,
      name: "Demo Member",
    },
    create: {
      email: "member@example.com",
      passwordHash: memberHash,
      name: "Demo Member",
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: { id: "demo-workspace" },
    update: {},
    create: {
      id: "demo-workspace",
      name: "Demo Workspace",
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_workspaceId: {
        userId: owner.id,
        workspaceId: workspace.id,
      },
    },
    update: {
      role: "OWNER",
    },
    create: {
      userId: owner.id,
      workspaceId: workspace.id,
      role: "OWNER",
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_workspaceId: {
        userId: member.id,
        workspaceId: workspace.id,
      },
    },
    update: {
      role: "MEMBER",
    },
    create: {
      userId: member.id,
      workspaceId: workspace.id,
      role: "MEMBER",
    },
  });

  const board = await prisma.board.findFirst({
    where: {
      workspaceId: workspace.id,
    },
  });

  if (!board) {
    const createdBoard = await prisma.board.create({
      data: {
        workspaceId: workspace.id,
        name: "Demo Board",
        lists: {
          create: [
            {
              name: "To Do",
              position: 1,
              tasks: {
                create: [
                  {
                    title: "Welcome to Collaborative Workspace",
                    description: "This is a demo task.",
                    position: 1,
                  },
                ],
              },
            },
            {
              name: "In Progress",
              position: 2,
            },
            {
              name: "Done",
              position: 3,
            },
          ],
        },
      },
    });

    console.log(`Created demo board: ${createdBoard.name}`);
  }

  console.log("");
  console.log("Demo accounts created:");
  console.log("Owner:  owner@example.com / Owner@123");
  console.log("Member: member@example.com / Member@123");
  console.log("");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });