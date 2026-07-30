"use client"

import { useActionState, useEffect, useRef, useState } from "react"

import { recordPayment, type PaymentActionState } from "@/app/(dashboard)/payments/actions"
import type { Booking, Customer } from "@/types/rental"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { SubmitButton } from "@/components/ui/submit-button"
import { useSlowPending } from "@/hooks/use-slow-pending"

const initialState: PaymentActionState = {}
const SAVED_CONFIRMATION_MS = 1_500

function RecordPaymentForm({
  bookings,
  customers,
  defaultReservationId,
}: {
  bookings: Booking[]
  customers: Customer[]
  /** Productization wave 2 phase 12 — the Today timeline's "Payment
   * expected" cards link here via `?reservationId=`, same
   * pre-selection convention as `/reservations/new?customerId=`
   * (roadmap phase 09's returning-customer fast path). Ignored if the
   * id doesn't match a booking the form already has loaded. */
  defaultReservationId?: string
}) {
  const [state, formAction, isPending] = useActionState(recordPayment, initialState)
  const isSlowPending = useSlowPending(isPending)
  const [reservationId, setReservationId] = useState(
    defaultReservationId && bookings.some((b) => b.id === defaultReservationId) ? defaultReservationId : ""
  )
  const selectedBooking = bookings.find((b) => b.id === reservationId)
  const formRef = useRef<HTMLFormElement>(null)

  // This form previously stayed mounted, unreset, with zero
  // confirmation after a successful transaction — the real risk being
  // a user unsure whether the click "took" and recording the same
  // payment twice. Roadmap phase 40: reset the form and show a real
  // "Saved" pulse on the pending->resolved-with-no-error edge.
  const wasPendingRef = useRef(false)
  const [justSaved, setJustSaved] = useState(false)
  useEffect(() => {
    const finishedSuccessfully = wasPendingRef.current && !isPending && !state.error
    wasPendingRef.current = isPending
    if (!finishedSuccessfully) return
    formRef.current?.reset()
    setReservationId("")
    setJustSaved(true)
    const timer = setTimeout(() => setJustSaved(false), SAVED_CONFIRMATION_MS)
    return () => clearTimeout(timer)
  }, [isPending, state])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record a transaction</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="reservationId">Reservation (optional)</Label>
              <NativeSelect
                id="reservationId"
                name="reservationId"
                value={reservationId}
                onChange={(e) => setReservationId(e.target.value)}
              >
                <option value="">No reservation</option>
                {bookings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.reference} · {b.customer.fullName}
                  </option>
                ))}
              </NativeSelect>
            </div>

            {selectedBooking ? (
              <input type="hidden" name="customerId" value={selectedBooking.customer.id} />
            ) : (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="customerId">Customer</Label>
                <NativeSelect id="customerId" name="customerId" defaultValue="" required>
                  <option value="" disabled>
                    Select a customer
                  </option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="transactionType">Type</Label>
              <NativeSelect id="transactionType" name="transactionType" defaultValue="rental_payment" required>
                <option value="rental_payment">Rental payment</option>
                <option value="damage_charge">Damage charge</option>
                <option value="additional_charge">Additional charge</option>
                <option value="refund">Refund</option>
              </NativeSelect>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="method">Method</Label>
              <NativeSelect id="method" name="method" defaultValue="cash" required>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="transfer">Transfer</option>
                <option value="other">Other</option>
              </NativeSelect>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amount">Amount (MAD)</Label>
              <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reference">Reference (optional)</Label>
              <Input id="reference" name="reference" />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input id="notes" name="notes" />
            </div>
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <div className="flex justify-end">
            <SubmitButton
              type="submit"
              status={isPending ? (isSlowPending ? "slow" : "pending") : justSaved ? "saved" : "idle"}
              savedLabel="Recorded"
            >
              Record transaction
            </SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export { RecordPaymentForm }
