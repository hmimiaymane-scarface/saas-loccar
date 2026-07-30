import { describe, expect, it, vi, beforeEach } from "vitest"

// The sync module also imports several "use server" action modules and
// client-storage helpers purely for their types/dispatch table — none
// of that is exercised by most tests in this file (which only import
// the two pure exports below), but vitest still evaluates the whole
// file, so the heavier imports are mocked to keep this file fast and
// side-effect-free. The `syncOfflineMutations` describe block below
// exercises the real dispatch loop, so it also mocks `@/lib/offline/db`
// (an IndexedDB wrapper unavailable in vitest's `node` environment).
vi.mock("@/app/(dashboard)/inspections/actions", () => ({
  saveInspectionFields: vi.fn(),
  attachInspectionMedia: vi.fn(),
  completeInspectionAction: vi.fn(),
}))
vi.mock("@/app/(dashboard)/damages/actions", () => ({ createDamage: vi.fn() }))
vi.mock("@/app/(dashboard)/documents/actions", () => ({ createDocumentRecord: vi.fn() }))
vi.mock("@/app/(dashboard)/contract-templates/actions", () => ({ addSignatureAction: vi.fn() }))
vi.mock("@/lib/storage-client", () => ({ uploadFile: vi.fn() }))
vi.mock("../db", () => ({
  listMutations: vi.fn(),
  getBlob: vi.fn(),
  updateMutation: vi.fn(),
  removeMutation: vi.fn(),
}))

import { completeInspectionAction } from "@/app/(dashboard)/inspections/actions"
import { listMutations, updateMutation, removeMutation, type QueuedMutation } from "../db"
import { isAlreadyAppliedMessage, isMutationReady, syncOfflineMutations } from "../sync"

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

describe("syncOfflineMutations", () => {
  beforeEach(() => {
    vi.mocked(completeInspectionAction).mockReset()
    vi.mocked(listMutations).mockReset()
    vi.mocked(updateMutation).mockReset()
    vi.mocked(removeMutation).mockReset()
  })

  it("does NOT run a mutation whose dependency is stuck in needs_review — a failed photo attach must not let the inspection complete anyway", async () => {
    const photoMutation: QueuedMutation = {
      id: "photo-1",
      type: "attachInspectionMedia",
      payload: { inspectionId: "insp_1" },
      createdAt: "2026-07-30T09:00:00.000Z",
      status: "needs_review",
      retryCount: 0,
      dependsOn: [],
      errorMessage: "That photo could not be validated.",
    }
    const completeMutation: QueuedMutation = {
      id: "complete-1",
      type: "completeInspection",
      payload: { inspectionId: "insp_1", reservationId: "res_1" },
      createdAt: "2026-07-30T09:01:00.000Z",
      status: "pending",
      retryCount: 0,
      dependsOn: ["photo-1"],
    }
    vi.mocked(listMutations).mockResolvedValue([photoMutation, completeMutation])
    vi.mocked(completeInspectionAction).mockResolvedValue({})

    const result = await syncOfflineMutations("company_1")

    // The real bug this test guards against: syncOfflineMutations used
    // to pre-seed its "done" set with needs_review ids, so a mutation
    // depending on a REJECTED (not synced) upload was treated as
    // unblocked and allowed to run — silently completing an inspection
    // that's actually missing a required photo.
    expect(completeInspectionAction).not.toHaveBeenCalled()
    expect(result.synced).toBe(0)
    expect(result.stillPending).toBeGreaterThan(0)
    expect(removeMutation).not.toHaveBeenCalledWith("complete-1")
  })
})
