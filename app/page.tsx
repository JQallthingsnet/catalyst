import { LoginForm } from "@/components/auth/login-form";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-2">
        <section className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-orange-600">Catalyst</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
            Work starts after you sign in.
          </h1>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            Enter the email you want to register. We send an 8-digit passcode to that address.
            After you confirm it, you land on your dashboard.
          </p>
        </section>
        <LoginForm />
      </div>
    </main>
  );
}
