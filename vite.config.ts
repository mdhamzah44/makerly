// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // @floating-ui/* (pulled in by Radix popper/popover/dropdown/tooltip/select) ships a UMD
  // fallback build alongside its ESM build. Nitro's own dependency-tracing step externalizes it
  // into a "_libs" chunk with a broken CJS-interop wrapper ("__commonJSMin is not a function") on
  // every request that renders a Radix popper-based component. `nitro.noExternals` — NOT Vite's
  // `ssr.noExternal`, which only affects Vite's own SSR graph and doesn't reach this step — stops
  // Nitro from externalizing it, bundling it directly into the server chunk instead.
  nitro: {
    noExternals: [/^@floating-ui\//],
  },
});