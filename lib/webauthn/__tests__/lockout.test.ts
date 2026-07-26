import { describe, expect, it } from "vitest"

import { isLocked, recordFailedAttempt, resetLockout, MAX_FAILED_ATTEMPTS, LOCKOUT_DURATION_MS, type LockoutState } from "../lockout"

const NOW = new Date("2026-07-26T12:00:00.000Z")

describe("isLocked", () => {
  it("is false with no lockout in force", () => {
    expect(isLocked({ failedAttempts: 0, lockedUntil: null }, NOW)).toBe(false)
  })

  it("is true while lockedUntil is in the future", () => {
    const future = new Date(NOW.getTime() + 60_000).toISOString()
    expect(isLocked({ failedAttempts: 5, lockedUntil: future }, NOW)).toBe(true)
  })

  it("is false once lockedUntil has passed", () => {
    const past = new Date(NOW.getTime() - 60_000).toISOString()
    expect(isLocked({ failedAttempts: 5, lockedUntil: past }, NOW)).toBe(false)
  })
})

/**
 * Roadmap phase 19 acceptance criterion: "WebAuthn lockout — N failed
 * attempts blocks the next one until locked_until passes."
 */
describe("recordFailedAttempt", () => {
  it("increments failedAttempts without locking below the threshold", () => {
    let state: LockoutState = { failedAttempts: 0, lockedUntil: null }
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) {
      state = recordFailedAttempt(state, NOW)
      expect(isLocked(state, NOW)).toBe(false)
    }
    expect(state.failedAttempts).toBe(MAX_FAILED_ATTEMPTS - 1)
  })

  it("locks once the threshold is reached", () => {
    let state: LockoutState = { failedAttempts: 0, lockedUntil: null }
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      state = recordFailedAttempt(state, NOW)
    }
    expect(state.failedAttempts).toBe(MAX_FAILED_ATTEMPTS)
    expect(isLocked(state, NOW)).toBe(true)
    expect(new Date(state.lockedUntil!).getTime()).toBe(NOW.getTime() + LOCKOUT_DURATION_MS)
  })

  it("does not push the unlock time further out on repeated attempts against an already-locked credential", () => {
    const locked = { failedAttempts: MAX_FAILED_ATTEMPTS, lockedUntil: new Date(NOW.getTime() + LOCKOUT_DURATION_MS).toISOString() }
    const later = new Date(NOW.getTime() + 60_000)
    const next = recordFailedAttempt(locked, later)
    expect(next.lockedUntil).toBe(locked.lockedUntil)
  })
})

describe("resetLockout", () => {
  it("clears both fields", () => {
    expect(resetLockout()).toEqual({ failedAttempts: 0, lockedUntil: null })
  })
})
