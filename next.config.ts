import type { NextConfig } from "next";

// Authenticated, per-user pages are rendered dynamically on every request, so
// Cache Components / Partial Prerendering are intentionally left off: every
// protected page reads the session and enforces authorization server-side.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Native / large server-only packages used by PDF rendering.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "unpdf"],
  // Fonts embedded into generated PDFs are read from disk at runtime.
  outputFileTracingIncludes: {
    "/api/resumes/[id]/pdf": ["./public/fonts/**/*"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
