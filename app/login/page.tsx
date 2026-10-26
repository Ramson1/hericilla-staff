"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { BigButton, BigInput, BigPasswordInput, Card } from "@hericilla/ui";
import { getSupabase, hasSupabaseEnv } from "@hericilla/supabase-clients";
import { STAFF_ROLES } from "@hericilla/types";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const s = getSupabase();
      const { data, error: signErr } = await s.auth.signInWithPassword({ email, password });
      if (signErr) throw signErr;
      const { data: profile } = await s
        .from("hericilla_profiles")
        .select("role, status")
        .eq("id", data.user!.id)
        .maybeSingle();
      if (!profile) {
        await s.auth.signOut();
        throw new Error("This account has no staff profile yet. Ask an administrator to complete your setup.");
      }
      if (profile.status !== "active") {
        await s.auth.signOut();
        throw new Error("This account is inactive. Ask an administrator to reactivate it.");
      }
      if (profile.role === "driver") {
        await s.auth.signOut();
        throw new Error("Drivers use the Hericilla Driver app on the phone — open it there to sign in.");
      }
      if (!STAFF_ROLES.includes(profile.role as (typeof STAFF_ROLES)[number])) {
        await s.auth.signOut();
        throw new Error("This account signs into the admin portal. Use the admin portal address instead.");
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in. Please try again.");
      setBusy(false);
    }
  }

  if (!hasSupabaseEnv()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg text-center p-10">
          <h1 className="text-xl font-bold text-brand-950">Almost there — one setup step</h1>
          <p className="mt-4 text-base text-ink-soft">
            The staff portal needs your Supabase project keys before anyone can sign in. Copy{" "}
            <code className="bg-brand-50 px-2 rounded">.env.example</code> to{" "}
            <code className="bg-brand-50 px-2 rounded">.env.local</code> in <strong>apps/staff-portal</strong>, paste the
            project URL and anon key from your Supabase dashboard, then restart the dev server.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-2">
      {/* Brand panel — big screens only */}
      <aside className="hidden flex-col justify-between bg-gradient-to-br from-brand-950 via-brand-900 to-brand-700 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="" width={56} height={56} className="rounded-xl bg-white p-1" />
          <span className="text-lg font-bold tracking-wide">Hericilla Support Services Ltd</span>
        </div>
        <div>
          <h2 className="text-4xl font-extrabold leading-tight">Staff Portal</h2>
          <p className="mt-4 max-w-md text-base text-brand-200">
            Job cards, trip reports, quotations and approvals — your day’s work, organised and documented in one
            place.
          </p>
          <p className="mt-8 text-base text-brand-300">RC 8100414 · “Working together for success.”</p>
        </div>
        <p className="text-base text-brand-300">Drivers: sign in on the Hericilla Driver app on your phone.</p>
      </aside>

      {/* Sign-in card */}
      <main className="flex min-h-screen items-center justify-center p-4 sm:p-8">
        <Card className="w-full max-w-md p-8 sm:p-10">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="" width={52} height={52} className="rounded-xl bg-white p-1 ring-1 ring-line" />
            <div>
              <h1 className="text-xl font-extrabold text-brand-950">Welcome back</h1>
              <p className="text-base text-ink-soft">Sign in to the Hericilla Staff portal</p>
            </div>
          </div>

          <form className="mt-8 space-y-5" onSubmit={signIn}>
            <BigInput
              label="Email address"
              type="email"
              autoComplete="username"
              placeholder="you@hericilla.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <BigPasswordInput
              label="Password"
              autoComplete="current-password"
              placeholder="Enter your password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <p className="rounded-lg bg-danger-100 p-4 text-danger-800 font-semibold" role="alert">
                {error}
              </p>
            )}
            <BigButton type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </BigButton>
            <p className="text-base text-ink-soft text-center">
              Forgot your password?{" "}
              <button
                type="button"
                onClick={() => router.push("/auth/reset-password")}
                className="font-semibold text-brand-700 underline hover:text-brand-800"
              >
                Send yourself a reset link
              </button>
              .
            </p>
          </form>
        </Card>
      </main>
    </div>
  );
}
