import { describe, expect, it, vi } from "vitest"

import { notify } from "../service"
import type { NotificationChannel, NotificationChannelId } from "../channels"

function fakeChannel(id: NotificationChannelId, configured: boolean) {
  return {
    id,
    configured,
    send: vi.fn().mockResolvedValue(undefined),
  } satisfies NotificationChannel
}

const basePayload = {
  companyId: "co_1",
  type: "damage_recorded" as const,
  title: "Damage needs review",
  priority: "operational" as const,
  actions: [{ label: "Review", href: "/damages/1", kind: "link" as const }],
}

describe("notify (platform service)", () => {
  it("defaults to in-app only", async () => {
    const inApp = fakeChannel("in_app", true)
    const registry = { in_app: inApp, email: fakeChannel("email", false), whatsapp: fakeChannel("whatsapp", false), sms: fakeChannel("sms", false), push: fakeChannel("push", false) }

    await notify({ ...basePayload, recipients: [{ userId: "u1" }] }, registry)

    expect(inApp.send).toHaveBeenCalledTimes(1)
  })

  it("skips an unconfigured channel without throwing", async () => {
    const email = fakeChannel("email", false)
    const registry = { in_app: fakeChannel("in_app", true), email, whatsapp: fakeChannel("whatsapp", false), sms: fakeChannel("sms", false), push: fakeChannel("push", false) }

    await expect(
      notify({ ...basePayload, recipients: [{ userId: "u1" }], channels: ["in_app", "email"] }, registry)
    ).resolves.toBeUndefined()
    expect(email.send).not.toHaveBeenCalled()
  })

  it("dispatches to every recipient", async () => {
    const inApp = fakeChannel("in_app", true)
    const registry = { in_app: inApp, email: fakeChannel("email", false), whatsapp: fakeChannel("whatsapp", false), sms: fakeChannel("sms", false), push: fakeChannel("push", false) }

    await notify({ ...basePayload, recipients: [{ userId: "u1" }, { userId: "u2" }] }, registry)

    expect(inApp.send).toHaveBeenCalledTimes(2)
  })

  it("calls a configured non-default channel when explicitly requested", async () => {
    const whatsapp = fakeChannel("whatsapp", true)
    const registry = { in_app: fakeChannel("in_app", true), email: fakeChannel("email", false), whatsapp, sms: fakeChannel("sms", false), push: fakeChannel("push", false) }

    await notify({ ...basePayload, recipients: [{ userId: "u1" }], channels: ["whatsapp"] }, registry)

    expect(whatsapp.send).toHaveBeenCalledTimes(1)
  })
})
