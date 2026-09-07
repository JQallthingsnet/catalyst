import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { getSession } from "@/lib/auth/session";
import { getUser } from "@/lib/auth/repository";
import { redirect } from "next/navigation";

const cards = [
  { label: "Projects", value: "0", hint: "Nothing created yet" },
  { label: "Team", value: "1", hint: "You are the first member" },
  { label: "Alerts", value: "0", hint: "All clear" },
  { label: "Status", value: "Live", hint: "Account is active" },
];

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  const user = await getUser(session.email);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-950">Catalyst</p>
            <p className="text-xs text-slate-500">Dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-sm text-slate-600 sm:block">{session.email}</p>
            <SignOutButton />
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-3xl font-semibold text-slate-950">
          Welcome{user?.name ? `, ${user.name}` : ""}
        </h1>
        <p className="mt-2 text-slate-600">
          Signed in as {session.email}. This is your workspace overview.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <article key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{card.value}</p>
              <p className="mt-1 text-sm text-slate-500">{card.hint}</p>
            </article>
          ))}
        </div>

        <article className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-950">Recent activity</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            No activity yet. After you add products, orders, or team actions, they will show up here.
          </p>
        </article>
      </section>
    </main>
  );
}
