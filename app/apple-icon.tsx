import { ImageResponse } from "next/og"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

/** iOS "Add to Home Screen" reads the `apple-touch-icon` link tag, not
 * the manifest's icons array — Next's `apple-icon.tsx` convention is
 * what actually produces that tag. */
export default function AppleIcon() {
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
        }}
      >
        <span style={{ fontSize: 96, fontWeight: 700, color: "#fafafa", fontFamily: "sans-serif" }}>R</span>
      </div>
    ),
    { ...size }
  )
}
