/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  reactStrictMode: true,
  basePath,
  output: "standalone",
  outputFileTracingIncludes: { "/api/icons": ["./node_modules/react-icons/*/index.js", "./node_modules/react-icons/lib/iconsManifest.js"] },
  devIndicators: false,
};

export default nextConfig;
