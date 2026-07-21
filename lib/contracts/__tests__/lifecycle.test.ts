import { describe, expect, it } from "vitest"

import {
  CONTRACT_STATUS_TRANSITIONS,
  canTransitionContract,
  allowedNextContractStatuses,
  isTerminalContractStatus,
  isCancellable,
  hasRequiredSignatures,
  type ContractStatus,
} from "@/lib/contracts/lifecycle"

describe("contract lifecycle transitions", () => {
  it("follows the full happy path in order", () => {
    const path: ContractStatus[] = ["draft", "prepared", "awaiting_signature", "signed", "active", "completed", "archived"]
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransitionContract(path[i], path[i + 1])).toBe(true)
    }
  })

  it("rejects skipping a state", () => {
    expect(canTransitionContract("draft", "signed")).toBe(false)
    expect(canTransitionContract("draft", "active")).toBe(false)
    expect(canTransitionContract("prepared", "active")).toBe(false)
  })

  it("rejects moving backward", () => {
    expect(canTransitionContract("signed", "prepared")).toBe(false)
    expect(canTransitionContract("active", "signed")).toBe(false)
  })

  it("allows cancellation from every pre-active state", () => {
    expect(canTransitionContract("draft", "cancelled")).toBe(true)
    expect(canTransitionContract("prepared", "cancelled")).toBe(true)
    expect(canTransitionContract("awaiting_signature", "cancelled")).toBe(true)
    expect(canTransitionContract("signed", "cancelled")).toBe(true)
  })

  it("does not allow cancellation once active, completed, or archived", () => {
    expect(canTransitionContract("active", "cancelled")).toBe(false)
    expect(canTransitionContract("completed", "cancelled")).toBe(false)
    expect(canTransitionContract("archived", "cancelled")).toBe(false)
  })

  it("archived and cancelled are dead ends", () => {
    expect(allowedNextContractStatuses("archived")).toEqual([])
    expect(allowedNextContractStatuses("cancelled")).toEqual([])
  })

  it("isTerminalContractStatus is true only for archived/cancelled", () => {
    expect(isTerminalContractStatus("archived")).toBe(true)
    expect(isTerminalContractStatus("cancelled")).toBe(true)
    expect(isTerminalContractStatus("active")).toBe(false)
    expect(isTerminalContractStatus("completed")).toBe(false)
  })

  it("isCancellable matches the transition table, not just 'not terminal'", () => {
    // active/completed are not terminal but are also not cancellable —
    // isCancellable must not be defined as merely !isTerminalContractStatus.
    expect(isCancellable("active")).toBe(false)
    expect(isCancellable("completed")).toBe(false)
    expect(isCancellable("draft")).toBe(true)
    expect(isCancellable("signed")).toBe(true)
  })

  it("every status is represented in the transition table", () => {
    const statuses: ContractStatus[] = ["draft", "prepared", "awaiting_signature", "signed", "active", "completed", "archived", "cancelled"]
    for (const status of statuses) {
      expect(CONTRACT_STATUS_TRANSITIONS[status]).toBeDefined()
    }
  })
})

describe("hasRequiredSignatures", () => {
  it("requires both customer and employee", () => {
    expect(hasRequiredSignatures(["customer", "employee"])).toBe(true)
  })

  it("is false with only a customer signature", () => {
    expect(hasRequiredSignatures(["customer"])).toBe(false)
  })

  it("is false with only an employee signature", () => {
    expect(hasRequiredSignatures(["employee"])).toBe(false)
  })

  it("optional signers (manager, additional driver) don't substitute for a required one", () => {
    expect(hasRequiredSignatures(["customer", "manager", "additional_driver"])).toBe(false)
  })

  it("is true when optional signers are present alongside both required ones", () => {
    expect(hasRequiredSignatures(["customer", "employee", "manager", "additional_driver"])).toBe(true)
  })

  it("is false with no signatures at all", () => {
    expect(hasRequiredSignatures([])).toBe(false)
  })
})
