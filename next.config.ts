import type { NextConfig } from "next";

const config: NextConfig = {
  typedRoutes: false,
  // Source maps are dead weight in a serverless bundle and slow the build,
  // which matters on the free tier's build minutes.
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  compress: true,
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
    // Tree-shakes barrel imports so a single icon does not pull the whole pack.
    optimizePackageImports: ["lucide-react", "recharts", "date-fns", "date-fns-tz", "cmdk"],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Hashed build assets never change under a given name.
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/icons/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ];
  },
};

export default config;
