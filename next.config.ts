// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,   // ✅ เพิ่มบรรทัดนี้
  reactCompiler: true,
};

export default nextConfig;
