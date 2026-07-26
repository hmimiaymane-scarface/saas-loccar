import type { TeamMember, TeamInvitation } from "@/types/rental"

// Productization wave 1 phase 2 — the demo roster only ever shows
// Owner + Staff now, matching the simplified 2-role product (the old
// roster mixed in agent/cleaner/mechanic mock members, which visibly
// contradicted "a normal rental owner never sees concepts that imply a
// large organization").
export const teamMembers: TeamMember[] = [
  {
    membershipId: "mem_1",
    userId: "emp_1",
    fullName: "Youssef El Amrani",
    email: "youssef@atlasrentcar.ma",
    role: "owner",
    status: "active",
    branchId: null,
    branchName: null,
    createdAt: "2026-01-10T09:00:00Z",
  },
  {
    membershipId: "mem_2",
    userId: "emp_2",
    fullName: "Sara Benkirane",
    email: "sara@atlasrentcar.ma",
    role: "manager",
    status: "active",
    branchId: "branch_1",
    branchName: "Main branch — Guéliz",
    createdAt: "2026-05-02T09:00:00Z",
  },
]

export const pendingInvitations: TeamInvitation[] = [
  {
    id: "inv_1",
    email: "hamid@example.com",
    role: "manager",
    branchId: null,
    branchName: null,
    status: "pending",
    token: "00000000-0000-0000-0000-000000000001",
    expiresAt: "2026-07-25T00:00:00Z",
    createdAt: "2026-07-18T09:00:00Z",
  },
]
