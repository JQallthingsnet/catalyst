"use client";

export function SignOutButton() {
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.assign("/");
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      className="rounded-xl border border-line px-3 py-1.5 text-sm text-quiet hover:border-accent hover:text-ink"
    >
      Sign out
    </button>
  );
}
