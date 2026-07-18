import { describe, expect, it } from "vitest"

import { canChangeRole, canSuspend, canRemove, canInvite } from "../team-rules"

describe("canChangeRole", () => {
  it("blocks self-promotion — an actor can never change their own role", () => {
    const result = canChangeRole("owner", true, "manager", false, "owner")
    expect(result.allowed).toBe(false)
  })

  it("blocks a manager from granting ownership", () => {
    const result = canChangeRole("manager", false, "agent", false, "owner")
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/only an owner/i)
  })

  it("blocks a manager from changing an existing owner's role at all", () => {
    const result = canChangeRole("manager", false, "owner", false, "manager")
    expect(result.allowed).toBe(false)
  })

  it("allows an owner to grant ownership to someone else", () => {
    expect(canChangeRole("owner", false, "agent", false, "owner").allowed).toBe(true)
  })

  it("blocks demoting the last remaining active owner", () => {
    const result = canChangeRole("owner", false, "owner", true, "manager")
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/at least one owner/i)
  })

  it("allows demoting an owner when another active owner still exists", () => {
    expect(canChangeRole("owner", false, "owner", false, "manager").allowed).toBe(true)
  })

  it("blocks an agent or accountant from changing anyone's role", () => {
    expect(canChangeRole("agent", false, "driver", false, "agent").allowed).toBe(false)
    expect(canChangeRole("accountant", false, "driver", false, "agent").allowed).toBe(false)
  })

  it("allows a manager to change a non-owner's role to a non-owner role", () => {
    expect(canChangeRole("manager", false, "agent", false, "accountant").allowed).toBe(true)
  })
})

describe("canSuspend", () => {
  it("blocks self-suspension", () => {
    expect(canSuspend("owner", true, "owner", false).allowed).toBe(false)
  })

  it("blocks a manager from suspending an owner", () => {
    expect(canSuspend("manager", false, "owner", false).allowed).toBe(false)
  })

  it("blocks suspending the last remaining active owner, even by another owner", () => {
    const result = canSuspend("owner", false, "owner", true)
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/at least one active owner/i)
  })

  it("allows suspending a non-owner", () => {
    expect(canSuspend("manager", false, "agent", false).allowed).toBe(true)
  })
})

describe("canRemove", () => {
  it("blocks self-removal", () => {
    expect(canRemove("owner", true, "manager", false).allowed).toBe(false)
  })

  it("blocks removing the last remaining owner", () => {
    expect(canRemove("owner", false, "owner", true).allowed).toBe(false)
  })

  it("blocks a manager from removing an owner", () => {
    expect(canRemove("manager", false, "owner", false).allowed).toBe(false)
  })

  it("allows an owner to remove a manager", () => {
    expect(canRemove("owner", false, "manager", false).allowed).toBe(true)
  })
})

describe("canInvite", () => {
  it("blocks a manager from inviting a co-owner", () => {
    expect(canInvite("manager", "owner").allowed).toBe(false)
  })

  it("allows an owner to invite a co-owner", () => {
    expect(canInvite("owner", "owner").allowed).toBe(true)
  })

  it("allows a manager to invite non-owner roles", () => {
    expect(canInvite("manager", "agent").allowed).toBe(true)
  })

  it("blocks an agent from inviting anyone", () => {
    expect(canInvite("agent", "driver").allowed).toBe(false)
  })
})
