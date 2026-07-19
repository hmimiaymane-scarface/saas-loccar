import { describe, expect, it } from "vitest"

import { resolveInitialStep, shouldAutoSelectSingleOption, unresolvedCount } from "../workflow/steps"

describe("resolveInitialStep", () => {
  it("resumes at the first incomplete step", () => {
    expect(resolveInitialStep([true, true, false, false])).toBe(2)
  })

  it("starts at the first step when nothing is complete yet", () => {
    expect(resolveInitialStep([false, false, false])).toBe(0)
  })

  it("lands on the last step when everything else is already complete", () => {
    expect(resolveInitialStep([true, true, true, false])).toBe(3)
  })

  it("falls back to the last index when every step is somehow complete", () => {
    expect(resolveInitialStep([true, true, true])).toBe(2)
  })

  it("returns 0 for an empty step list rather than a negative index", () => {
    expect(resolveInitialStep([])).toBe(0)
  })

  it("never re-resolves past a step the user already completed out of order", () => {
    // Optional steps are represented as always-true in the caller, so a
    // completed-but-optional step never blocks resuming further in.
    expect(resolveInitialStep([true, true, true, false, false])).toBe(3)
  })
})

describe("shouldAutoSelectSingleOption", () => {
  it("auto-selects when exactly one option exists and nothing is chosen", () => {
    expect(shouldAutoSelectSingleOption(1, false)).toBe(true)
  })

  it("never auto-selects among multiple options", () => {
    expect(shouldAutoSelectSingleOption(2, false)).toBe(false)
  })

  it("never overrides an existing selection, even with one option", () => {
    expect(shouldAutoSelectSingleOption(1, true)).toBe(false)
  })

  it("does nothing when there are no options", () => {
    expect(shouldAutoSelectSingleOption(0, false)).toBe(false)
  })
})

describe("unresolvedCount", () => {
  it("counts only the items that aren't done", () => {
    expect(
      unresolvedCount([
        { label: "a", done: true },
        { label: "b", done: false },
        { label: "c", done: false },
      ])
    ).toBe(2)
  })

  it("returns 0 when everything is done", () => {
    expect(unresolvedCount([{ label: "a", done: true }])).toBe(0)
  })

  it("returns 0 for an empty list", () => {
    expect(unresolvedCount([])).toBe(0)
  })
})
