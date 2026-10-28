import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: [
      { find: "react-dom/client", replacement: "preact/compat/client" },
      { find: "react-dom", replacement: "preact/compat" },
      { find: /^react$/, replacement: "preact/compat" },
      { find: "react/jsx-runtime", replacement: "preact/jsx-runtime" },
      { find: "react/jsx-dev-runtime", replacement: "preact/jsx-dev-runtime" },
    ],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Keep every runtime file at the WGT root. ZIPs produced on Windows do not carry
    // POSIX directory execute bits, and Tizen TV otherwise rejects /assets/* at runtime.
    assetsDir: "",
    target: "chrome110",
    assetsInlineLimit: 4096,
  },
});
