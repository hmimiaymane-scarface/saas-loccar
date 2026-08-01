import { Search } from "lucide-react"

import { contractStatusLabel, type ContractStatus } from "@/lib/contracts/lifecycle"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

/** Plain GET form — filters live in the URL, same pattern the
 * reservations/documents list pages already use elsewhere, so the
 * search is bookmarkable/shareable and needs no client-side state. */
function ContractSearchForm({
  initial,
  statuses,
}: {
  initial: { customerName?: string; vehiclePlate?: string; contractNumber?: string; status?: string; dateFrom?: string; dateTo?: string }
  statuses: ContractStatus[]
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" action="/contracts">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="customerName" defaultValue={initial.customerName} placeholder="Customer name" className="ps-9" />
          </div>
          <Input name="vehiclePlate" defaultValue={initial.vehiclePlate} placeholder="Vehicle plate" />
          <Input name="contractNumber" defaultValue={initial.contractNumber} placeholder="Contract number (e.g. CT-1004)" />
          <NativeSelect name="status" defaultValue={initial.status ?? ""}>
            <option value="">Any status</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {contractStatusLabel(s)}
              </option>
            ))}
          </NativeSelect>
          <Input type="date" name="dateFrom" defaultValue={initial.dateFrom} />
          <Input type="date" name="dateTo" defaultValue={initial.dateTo} />
          <Button type="submit" className="sm:col-span-2 lg:col-span-1">
            Search
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export { ContractSearchForm }
