import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Use project root so Turbopack resolves from flexiwork-rosta (avoids wrong lockfile/cache path)
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
