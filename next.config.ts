import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // jsdom + its transitive html-encoding-sniffer/@exodus/bytes chain mixes CJS and ESM
  // in a way Turbopack's bundler can't resolve. Marking it external keeps Node's native
  // resolver in charge, which handles the mixed-module chain correctly.
  serverExternalPackages: ['jsdom', '@mozilla/readability'],
};

export default nextConfig;
