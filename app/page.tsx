import { LoginForm } from "@/components/auth/login-form";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-2">
        <section className="max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">ATN Catalyst</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            Order SIMs, plans, and pools for your customers.
          </h1>
          <p className="mt-4 text-lg leading-8 text-quiet">
            Multi-tenant MVNE portal for resellers. Enter your email for an 8-digit passcode. First sign-in registers
            you to your tenant.
          </p>
        </section>
        <LoginForm />
      </div>
    </main>
  );
}
