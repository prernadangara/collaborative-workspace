import { describe, expect, it } from "vitest";
import {
  canInviteAs,
  canManageMember,
  canMutateContent,
} from "./permissions";

describe("canManageMember", () => {
  it("lets the owner manage admins, members and viewers", () => {
    for (const target of ["ADMIN", "MEMBER", "VIEWER"] as const) {
      expect(canManageMember("OWNER", target, "a", "b")).toBe(true);
    }
  });

  it("never lets anyone touch an owner", () => {
    for (const actor of ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const) {
      expect(canManageMember(actor, "OWNER", "a", "b")).toBe(false);
    }
  });

  it("stops admins managing other admins", () => {
    expect(canManageMember("ADMIN", "ADMIN", "a", "b")).toBe(false);
  });

  it("lets admins manage members and viewers, but not grant ADMIN", () => {
    expect(canManageMember("ADMIN", "MEMBER", "a", "b", "VIEWER")).toBe(true);
    expect(canManageMember("ADMIN", "VIEWER", "a", "b", "MEMBER")).toBe(true);
    expect(canManageMember("ADMIN", "MEMBER", "a", "b", "ADMIN")).toBe(false);
  });

  it("stops members and viewers managing anyone", () => {
    expect(canManageMember("MEMBER", "VIEWER", "a", "b")).toBe(false);
    expect(canManageMember("VIEWER", "VIEWER", "a", "b")).toBe(false);
  });

  it("blocks acting on yourself and granting OWNER", () => {
    expect(canManageMember("OWNER", "ADMIN", "a", "a")).toBe(false);
    expect(canManageMember("OWNER", "ADMIN", "a", "b", "OWNER" as never)).toBe(false);
  });
});

describe("canInviteAs", () => {
  it("only owner can invite admins", () => {
    expect(canInviteAs("OWNER", "ADMIN")).toBe(true);
    expect(canInviteAs("ADMIN", "ADMIN")).toBe(false);
  });
  it("admin can invite members/viewers; members cannot invite", () => {
    expect(canInviteAs("ADMIN", "MEMBER")).toBe(true);
    expect(canInviteAs("MEMBER", "VIEWER")).toBe(false);
  });
});

describe("canMutateContent", () => {
  it("viewers are read-only", () => {
    expect(canMutateContent("VIEWER")).toBe(false);
    expect(canMutateContent("MEMBER")).toBe(true);
    expect(canMutateContent("ADMIN")).toBe(true);
    expect(canMutateContent("OWNER")).toBe(true);
  });
});
