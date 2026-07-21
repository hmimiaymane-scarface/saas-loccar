import { ImageResponse } from "next/og"

export const size = { width: 32, height: 32 }
export const contentType = "image/png"

/** Browser-tab favicon — auto-wired into <head> by Next's `icon.tsx`
 * convention. Same monogram/colors as the dedicated PWA install icons
 * in app/icons/[size]/route.tsx, kept as a separate file since this
 * one's URL is intentionally build-hashed (favicons are meant to be
 * cache-busted on every deploy; install icons referenced from a
 * manifest are not, since app stores/OSes cache them for a long time). */
export default function Icon() {
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
          borderRadius: 6,
        }}
      >
        <span style={{ fontSize: 20, fontWeight: 700, color: "#fafafa", fontFamily: "sans-serif" }}>R</span>
      </div>
    ),
    { ...size }
  )
}
