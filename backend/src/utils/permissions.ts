export type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

const RANK: Record<Role, number> = { OWNER: 4, ADMIN: 3, MEMBER: 2, VIEWER: 1 };

/**
 * Who may change / remove whom.
 *  - Nobody can touch an OWNER, and nobody can act on themselves.
 *  - OWNER can manage ADMIN, MEMBER, VIEWER.
 *  - ADMIN can manage only MEMBER and VIEWER, and can only grant MEMBER/VIEWER.
 *  - MEMBER / VIEWER can manage no one.
 */
export function canManageMember(
  actorRole: Role,
  targetRole: Role,
  actorId: string,
  targetId: string,
  newRole?: Role
): boolean {
  if (actorId === targetId) return false;
  if (targetRole === "OWNER") return false;
  if (newRole === "OWNER") return false;
  if (RANK[actorRole] < RANK.ADMIN) return false;
  // must strictly outrank the target, and cannot grant own rank or higher
  if (RANK[actorRole] <= RANK[targetRole]) return false;
  if (newRole && RANK[actorRole] <= RANK[newRole]) return false;
  return true;
}

export function canInviteAs(actorRole: Role, invitedRole: Role): boolean {
  if (invitedRole === "OWNER") return false;
  if (RANK[actorRole] < RANK.ADMIN) return false;
  return RANK[actorRole] > RANK[invitedRole];
}

export function canMutateContent(role: Role): boolean {
  return RANK[role] >= RANK.MEMBER;
}
