import { describe, expect, it, vi } from "vitest"

// The sync module also imports several "use server" action modules and
// client-storage helpers purely for their types/dispatch table — none
// of that is exercised by these tests (which only import the two pure
// exports below), but vitest still evaluates the whole file, so the
// heavier imports are mocked to keep this file fast and side-effect-free.
vi.mock("@/app/(dashboard)/inspections/actions", () => ({
  saveInspectionFields: vi.fn(),
  attachInspectionMedia: vi.fn(),
  completeInspectionAction: vi.fn(),
}))
vi.mock("@/app/(dashboard)/damages/actions", () => ({ createDamage: vi.fn() }))
vi.mock("@/app/(dashboard)/documents/actions", () => ({ createDocumentRecord: vi.fn() }))
vi.mock("@/lib/storage-client", () => ({ uploadFile: vi.fn() }))

import { isAlreadyAppliedMessage, isMutationReady } from "../sync"

describe("isAlreadyAppliedMessage", () => {
  it("recognizes complete_inspection's own 'already completed' exception as a harmless replay", () => {
    expect(isAlreadyAppliedMessage("This inspection is already completed")).toBe(true)
  })

  it("is case-insensitive", () => {
    expect(isAlreadyAppliedMessage("Already Completed")).toBe(true)
  })

  it("does not match an unrelated rejection", () => {
    expect(isAlreadyAppliedMessage("Odometer and fuel level are required to complete an inspection")).toBe(false)
  })

  it("does not match a genuine conflict that merely mentions completion in passing", () => {
    expect(isAlreadyAppliedMessage("A return inspection can only be completed for an active rental")).toBe(false)
  })
})

describe("isMutationReady", () => {
  it("is ready when there are no dependencies", () => {
    expect(isMutationReady([], [{ id: "a" }], new Set())).toBe(true)
  })

  it("is ready when every dependency already synced and was removed from the queue entirely", () => {
    expect(isMutationReady(["photo-1"], [{ id: "this-one" }], new Set())).toBe(true)
  })

  it("is ready when every dependency is marked done in this same pass", () => {
    expect(isMutationReady(["photo-1"], [{ id: "photo-1" }, { id: "this-one" }], new Set(["photo-1"]))).toBe(true)
  })

  it("is NOT ready when a dependency is still queued and not yet done", () => {
    expect(isMutationReady(["photo-1"], [{ id: "photo-1" }, { id: "this-one" }], new Set())).toBe(false)
  })

  it("is not ready if even one of several dependencies is still outstanding", () => {
    expect(
      isMutationReady(
        ["photo-1", "photo-2"],
        [{ id: "photo-1" }, { id: "photo-2" }, { id: "this-one" }],
        new Set(["photo-1"])
      )
    ).toBe(false)
  })
})
