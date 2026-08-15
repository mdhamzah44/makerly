import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig(async ({ command }) => ({
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
      // Keep server-only code (db/email/auth secrets) out of the client bundle.
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    // Nitro builds the deployable server bundle. Preset is picked up from the
    // NITRO_PRESET env var (see netlify.toml, which sets NITRO_PRESET=netlify);
    // falls back to Nitro's own default when that env var isn't set.
    command === "build" &&
      (await import("nitro/vite")).nitro({}),
    viteReact(),
  ],
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
    ignoreOutdatedRequests: true,
  },
  server: {
    host: "::",
    port: 8080,
    watch: {
      awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 },
    },
  },
}));
