import { createFileRoute, redirect } from "@tanstack/react-router";

import { AuthScreen } from "@/components/auth-screen";
import { adminMe } from "@/lib/admin.functions";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in · 1Antiq Admin Console" },
      {
        name: "description",
        content: "Secure sign-in for the 1Antiq marketplace operations console.",
      },
      { property: "og:title", content: "Sign in · 1Antiq Admin Console" },
      { property: "og:description", content: "Secure sign-in for marketplace staff." },
    ],
  }),
  loader: async () => {
    const me = await adminMe();
    if (me.admin) throw redirect({ to: "/dashboard" });
    return me;
  },
  component: LoginPage,
});

function LoginPage() {
  const { needsBootstrap } = Route.useLoaderData();
  return <AuthScreen needsBootstrap={needsBootstrap} />;
}