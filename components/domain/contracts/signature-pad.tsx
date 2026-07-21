"use client"

import { useRef, useState } from "react"
import { Eraser } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Roadmap phase 16 — a genuine drawn signature, the addition
 * `contract_signatures.method`'s own original migration comment
 * anticipated ("a real drawn-signature capture can be added later
 * without a schema change"). Plain HTML5 canvas + pointer events, no
 * new dependency — well within hand-rolled scope for something this
 * self-contained, unlike WebAuthn's crypto ceremonies or IndexedDB's
 * transaction semantics elsewhere in this phase.
 *
 * Typed-name + checkbox (components/domain/contracts/contract-signature-section.tsx's
 * existing mechanism) is NOT replaced — it stays the fallback for a
 * signer who can't draw on this device (a desktop mouse, an
 * accessibility need), and this pad's own "or type your name instead"
 * escape hatch defers to it.
 */
function SignaturePad({ onCapture }: { onCapture: (blob: Blob) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const [hasDrawn, setHasDrawn] = useState(false)

  function getContext() {
    const canvas = canvasRef.current
    return canvas?.getContext("2d") ?? null
  }

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = getContext()
    if (!ctx) return
    drawingRef.current = true
    const { x, y } = pointFromEvent(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    canvasRef.current?.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const ctx = getContext()
    if (!ctx) return
    const { x, y } = pointFromEvent(e)
    ctx.lineWidth = 2.5
    ctx.lineCap = "round"
    ctx.strokeStyle = "#111111"
    ctx.lineTo(x, y)
    ctx.stroke()
    if (!hasDrawn) setHasDrawn(true)
  }

  function handlePointerUp() {
    drawingRef.current = false
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = getContext()
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }

  function capture() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (blob) onCapture(blob)
    }, "image/png")
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        width={400}
        height={160}
        className="w-full touch-none rounded-2xl border border-dashed border-border bg-background"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <div className="flex justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!hasDrawn}>
          <Eraser className="size-3.5" />
          Clear
        </Button>
        <Button type="button" size="sm" onClick={capture} disabled={!hasDrawn}>
          Use this signature
        </Button>
      </div>
    </div>
  )
}

export { SignaturePad }
