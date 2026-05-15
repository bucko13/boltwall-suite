/** @type {import("next").NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: true,
  serverExternalPackages: ["@boltwall/adapters", "@boltwall/l402", "@boltwall/middleware"],
};

export default nextConfig;
