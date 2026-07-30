import type { NextConfig } from "next";
import withBundleAnalyzerInit from "@next/bundle-analyzer";

// Roadmap phase 41 (Frontend Performance Pass) — this app had zero
// bundle-size instrumentation before this phase. Only active behind
// `ANALYZE=true`, so a normal build/dev run is completely unaffected;
// run `ANALYZE=true npm run build` to open the treemap report.
const withBundleAnalyzer = withBundleAnalyzerInit({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  images: {
    // Same phase — Supabase Storage signed/public photo URLs (vehicle,
    // customer, damage, inspection photos) are the only external
    // images this app ever renders. Project ref varies per deployment,
    // hence the wildcard host rather than one hardcoded project.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
};

export default withBundleAnalyzer(nextConfig);
