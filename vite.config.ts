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
  vite: {
    ssr: {
      // @floating-ui/* (pulled in by Radix popper/popover/dropdown/tooltip/select) ships a UMD
      // fallback build alongside its ESM build. When Nitro externalizes it for the server bundle
      // instead of letting Vite process it, the generated CJS-interop chunk ends up missing its
      // helper at runtime ("__commonJSMin is not a function") on every request that renders a
      // Radix popper-based component. Forcing it through Vite's own SSR bundling avoids that.
      noExternal: [/^@floating-ui\//],
    },
  },
});