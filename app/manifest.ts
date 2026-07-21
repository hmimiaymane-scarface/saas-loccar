import type { MetadataRoute } from "next"

/**
 * Roadmap phase 16 — the one piece of PWA installability Next.js
 * generates automatically once this file exists (a <link rel="manifest">
 * tag is injected into every page's <head> with zero manual wiring).
 * Icon URLs point at app/icons/[size]/route.tsx — a plain, stable Route
 * Handler, not the icon.tsx/apple-icon.tsx special conventions (those
 * are for the browser-tab favicon and iOS home-screen tag specifically,
 * covered separately by app/icon.tsx and app/apple-icon.tsx).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RentalOS",
    short_name: "RentalOS",
    description: "The digital office for your rental-car business — mission feed, inspections, and field workflows.",
    start_url: "/home",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#111111",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
