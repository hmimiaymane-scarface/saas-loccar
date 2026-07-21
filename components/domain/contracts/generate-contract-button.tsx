import Link from "next/link"
import { FileSignature } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Roadmap phase 10 requirement 3's original entry point, now roadmap
 * phase 11 requirement 1's preview step: "before generation, show a
 * clear preview... this is the final verification step." No longer
 * generates directly — routes to `/reservations/[id]/contract-preview`,
 * which is where `generateContractAction` actually gets called, only
 * after the owner has seen the resolved data, the validation issues,
 * and the AI's advisory warnings. */
function GenerateContractButton({ reservationId }: { reservationId: string }) {
  return (
    <Button variant="outline" asChild>
      <Link href={`/reservations/${reservationId}/contract-preview`}>
        <FileSignature />
        Generate contract
      </Link>
    </Button>
  )
}

export { GenerateContractButton }
