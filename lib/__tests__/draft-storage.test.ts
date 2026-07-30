import { afterEach, describe, expect, it } from "vitest"

import { clearDraft, readDraft, writeDraft } from "@/lib/draft-storage"

interface Draft {
  name: string
  phone: string
}

function installFakeLocalStorage() {
  const store = new Map<string, string>()
  const fakeLocalStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }
  // vitest runs in a plain Node environment (no `window`) — this is the
  // established pattern for this repo's SSR-safe browser-storage code
  // (see the module's own `typeof window === "undefined"` guard, which
  // this test also exercises directly by removing the stub afterward).
  ;(globalThis as { window?: unknown }).window = { localStorage: fakeLocalStorage }
  return store
}

function removeWindowStub() {
  delete (globalThis as { window?: unknown }).window
}

describe("draft-storage", () => {
  afterEach(() => {
    removeWindowStub()
  })

  it("returns null when no window exists (SSR)", () => {
    expect(readDraft<Draft>("k")).toBeNull()
  })

  it("writeDraft is a no-op and clearDraft is a no-op when no window exists (SSR)", () => {
    expect(() => writeDraft<Draft>("k", { name: "a" })).not.toThrow()
    expect(() => clearDraft("k")).not.toThrow()
  })

  it("round-trips a value through write then read", () => {
    installFakeLocalStorage()
    writeDraft<Draft>("wizard:customer", { name: "Ahmed Tazi", phone: "+212661234567" })
    expect(readDraft<Draft>("wizard:customer")).toEqual({ name: "Ahmed Tazi", phone: "+212661234567" })
  })

  it("returns null for a key that was never written", () => {
    installFakeLocalStorage()
    expect(readDraft<Draft>("never-written")).toBeNull()
  })

  it("clearDraft removes a previously written value", () => {
    installFakeLocalStorage()
    writeDraft<Draft>("wizard:customer", { name: "Ahmed Tazi", phone: "+212661234567" })
    clearDraft("wizard:customer")
    expect(readDraft<Draft>("wizard:customer")).toBeNull()
  })

  it("returns null instead of throwing on corrupted JSON", () => {
    const store = installFakeLocalStorage()
    store.set("wizard:customer", "{not valid json")
    expect(readDraft<Draft>("wizard:customer")).toBeNull()
  })
})
