import { ImageResponse } from "next/og"

/**
 * Stable, hand-controlled URLs for the PWA install icons referenced by
 * app/manifest.ts (/icons/192, /icons/512, /icons/512-maskable) —
 * deliberately a plain Route Handler, NOT the icon.tsx/apple-icon.tsx
 * special file convention, since that convention appends a build-hashed
 * query string to its generated URLs (fine for the auto-wired <head>
 * tags it produces, but a manifest.icons[].src needs a URL this file
 * fully controls and can predict ahead of time). icon.tsx/apple-icon.tsx
 * still exist separately for the browser-tab favicon and iOS home-
 * screen tag.
 *
 * A maskable icon must fill the entire canvas edge-to-edge with the
 * background color — the "safe zone" (~80% of the canvas, centered) is
 * the only area guaranteed visible once the OS applies its own mask
 * shape (circle, squircle, etc.), so the monogram shrinks and the
 * background padding grows for the maskable variant rather than
 * cropping content.
 */
const SIZES: Record<string, { width: number; height: number; maskable: boolean }> = {
  "192": { width: 192, height: 192, maskable: false },
  "512": { width: 512, height: 512, maskable: false },
  "512-maskable": { width: 512, height: 512, maskable: true },
}

export function generateStaticParams() {
  return Object.keys(SIZES).map((size) => ({ size }))
}

export const dynamicParams = false

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params
  const config = SIZES[size] ?? SIZES["512"]
  const { width, height, maskable } = config
  const fontSize = maskable ? Math.round(width * 0.32) : Math.round(width * 0.5)

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#111111",
          borderRadius: maskable ? 0 : Math.round(width * 0.18),
        }}
      >
        <span
          style={{
            fontSize,
            fontWeight: 700,
            color: "#fafafa",
            fontFamily: "sans-serif",
            letterSpacing: -2,
          }}
        >
          R
        </span>
      </div>
    ),
    { width, height }
  )
}
