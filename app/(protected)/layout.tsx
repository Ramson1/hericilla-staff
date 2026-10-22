"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, BigButton, Skeleton } from "@hericilla/ui";
import { StaffShell } from "@/components/StaffShell";
import { useAuth } from "@/lib/auth";
import { hasSupabaseEnv } from "@hericilla/supabase-clients";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { ready, user, blockedReason, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  if (!hasSupabaseEnv()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg text-center p-10">
          <h1 className="text-2xl font-bold text-brand-950">Supabase is not connected yet</h1>
          <p className="mt-4 text-lg text-ink-soft">
            Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/staff-portal/.env.local, then restart the dev server.
          </p>
        </Card>
      </div>
    );
  }

  if (!ready || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (blockedReason) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg text-center p-10">
          <h1 className="text-2xl font-bold text-brand-950">Wrong door for this account</h1>
          <p className="mt-4 text-lg text-ink-soft">{blockedReason}</p>
          <BigButton className="mt-6" variant="secondary" onClick={() => void signOut()}>
            Sign out
          </BigButton>
        </Card>
      </div>
    );
  }

  return <StaffShell>{children}</StaffShell>;
}
