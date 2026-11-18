import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mvp/shared"],
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async rewrites() {
    const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:3001";
    return [{ source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` }];
  },
};

export default nextConfig;
