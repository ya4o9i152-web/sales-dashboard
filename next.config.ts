import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // 月次の売上CSV（数千行）を Server Action で受け取るため。Vercel の上限 4.5MB より小さくしておく
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
