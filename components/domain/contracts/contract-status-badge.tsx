import type { ContractStatus } from "@/lib/contracts/lifecycle"
import { contractStatusConfig } from "@/lib/status"
import { StatusBadge } from "@/components/domain/status-badge"

function ContractStatusBadge({ status }: { status: ContractStatus }) {
  return <StatusBadge visual={contractStatusConfig[status]} />
}

export { ContractStatusBadge }
