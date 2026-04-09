import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow embedding in Appsmith iFrames and external URLs
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            // Specifically define framing rules over CSP
            key: "Content-Security-Policy",
            value: "frame-ancestors *;",
          },
          {
            // Enable CORS for API routes if needed by Appsmith scripts
            key: "Access-Control-Allow-Origin",
            value: "*",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,OPTIONS,PATCH,DELETE,POST,PUT",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
