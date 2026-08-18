import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — there is a stray package-lock.json in a parent
  // directory that Next would otherwise pick as the root.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
