import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  webpack: (config) => {
    // The project lives on a drive root; don't let Watchpack scan Windows system folders.
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        "**/node_modules/**",
        "**/.next/**",
        "**/System Volume Information/**",
        "**/$RECYCLE.BIN/**",
      ],
    };
    return config;
  },
};

export default nextConfig;
