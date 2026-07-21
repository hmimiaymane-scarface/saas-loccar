/**
 * Roadmap phase 11 requirement 3 — the contract lifecycle as an
 * explicit state machine, "state over flags" (bible Chapter 12 §7),
 * mirroring `lib/reservations/status.ts`'s exact shape: a pure
 * transition table the UI reads to decide which action to offer,
 * paired with the same rule enforced again at the database layer
 * (this codebase's established defense-in-depth pattern — a direct
 * API call or a bug elsewhere can never force an illegal transition
 * just because the UI didn't happen to check).
 *
 * Draft → Prepared → Awaiting Signature → Signed → Active → Completed
 * → Archived, with a Cancelled branch reachable from every
 * pre-signing/pre-active state. `active`/`completed`/`archived` have
 * no cancel path once the rental itself is genuinely underway —
 * cancelling the underlying reservation at that point is a
 * reservation-lifecycle concern, not something this contract-status
 * field should also try to represent.
 */

export type ContractStatus = "draft" | "prepared" | "awaiting_signature" | "signed" | "active" | "completed" | "archived" | "cancelled"

export const CONTRACT_STATUS_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  draft: ["prepared", "cancelled"],
  prepared: ["awaiting_signature", "cancelled"],
  awaiting_signature: ["signed", "cancelled"],
  signed: ["active", "cancelled"],
  active: ["completed"],
  completed: ["archived"],
  archived: [],
  cancelled: [],
}

export function allowedNextContractStatuses(current: ContractStatus): ContractStatus[] {
  return CONTRACT_STATUS_TRANSITIONS[current]
}

export function canTransitionContract(current: ContractStatus, next: ContractStatus): boolean {
  return CONTRACT_STATUS_TRANSITIONS[current].includes(next)
}

const TERMINAL_CONTRACT_STATUSES: ContractStatus[] = ["archived", "cancelled"]

export function isTerminalContractStatus(status: ContractStatus): boolean {
  return TERMINAL_CONTRACT_STATUSES.includes(status)
}

const CANCELLABLE_STATUSES: ContractStatus[] = ["draft", "prepared", "awaiting_signature", "signed"]

export function isCancellable(status: ContractStatus): boolean {
  return CANCELLABLE_STATUSES.includes(status)
}

const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Draft",
  prepared: "Prepared",
  awaiting_signature: "Awaiting signature",
  signed: "Signed",
  active: "Active",
  completed: "Completed",
  archived: "Archived",
  cancelled: "Cancelled",
}

export function contractStatusLabel(status: ContractStatus): string {
  return CONTRACT_STATUS_LABELS[status]
}

const CONTRACT_ACTION_LABELS: Partial<Record<ContractStatus, string>> = {
  prepared: "Mark as prepared",
  awaiting_signature: "Send for signature",
  active: "Activate",
  completed: "Complete",
  archived: "Archive",
  cancelled: "Cancel",
}

export function contractActionLabelFor(next: ContractStatus): string {
  return CONTRACT_ACTION_LABELS[next] ?? next
}

/** "Signed" is never a manually-clicked transition — it only happens
 * as a side effect of `addContractSignature` once both required
 * signer types are on file (see `hasRequiredSignatures`). Buttons
 * driven by `allowedNextContractStatuses` should skip it. */
export function isManualTransition(status: ContractStatus): boolean {
  return status !== "signed"
}

export type SignerType = "customer" | "additional_driver" | "employee" | "manager"

/**
 * "Required signatures present" (requirement 2/4) — a contract can't
 * become Signed without at least the two universally-required
 * parties. Additional driver / manager signatures are situational
 * add-ons, never blocking.
 */
const REQUIRED_SIGNER_TYPES: SignerType[] = ["customer", "employee"]

export function hasRequiredSignatures(signerTypes: SignerType[]): boolean {
  return REQUIRED_SIGNER_TYPES.every((required) => signerTypes.includes(required))
}
