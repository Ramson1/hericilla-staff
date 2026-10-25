"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  BigButton,
  Card,
  RowCard,
  StatusBadge,
  Skeleton,
  EmptyState,
} from "@hericilla/ui";
import { getSupabase, hasSupabaseEnv } from "@hericilla/supabase-clients";
import { statusLabel } from "@hericilla/types";
import { useAuth } from "@/lib/auth";

type Assignment = {
  id: string;
  shift_id: string;
  work_date: string;
  site_id: string | null;
  work_order_id: string | null;
  shift_name?: string;
  start_time?: string;
  end_time?: string;
};
type LastEvent = { event_type: string; event_time: string; geofence_result: string };

export default function StaffDashboard() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = new Date(Date.now() + 3600_000).toISOString().slice(0, 10); // WAT-ish date

  const { data: assignments } = useQuery({
    queryKey: ["my-assignments", today],
    queryFn: async () => {
      if (!hasSupabaseEnv()) return [];
      const { data } = await getSupabase()
        .from("hericilla_shift_assignments")
        .select("*, shift:hericilla_shifts!shift_assignments_shift_id_fkey(name, start_time, end_time)")
        .eq("employee_id", profile!.id)
        .eq("work_date", today);
      const pick = <T,>(v: unknown): T | null => (v == null ? null : Array.isArray(v) ? ((v[0] as T) ?? null) : (v as T));
      type Raw = Assignment & { shift: unknown };
      return ((data as Raw[]) ?? []).map((r) => {
        const s = pick<{ name: string; start_time: string; end_time: string }>(r.shift);
        const { shift: _drop, ...rest } = r;
        return { ...rest, shift_name: s?.name, start_time: s?.start_time, end_time: s?.end_time };
      });
    },
    enabled: !!profile,
  });

  const { data: lastEvent } = useQuery({
    queryKey: ["my-last-event", today],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_attendance_events")
        .select("event_type, event_time, geofence_result")
        .eq("employee_id", profile!.id)
        .gte("event_time", today + "T00:00:00+01:00")
        .order("event_time", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as LastEvent) ?? null;
    },
    enabled: !!profile,
  });

  const { data: announcements } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_announcements").select("*").order("created_at", { ascending: false }).limit(5);
      return (data as { id: string; title: string; body: string; created_at: string }[]) ?? [];
    },
    enabled: !!profile,
  });

  const [chosen, setChosen] = useState<string>("");
  const assignment = (assignments ?? []).find((a) => a.id === chosen) ?? (assignments ?? [])[0] ?? null;

  const nextAction =
    !lastEvent ? "clock_in" : lastEvent.event_type === "clock_in" ? "clock_out" : lastEvent.event_type === "break_start" ? "break_end" : "clock_in";

  async function doClock(type: "clock_in" | "clock_out" | "break_start" | "break_end") {
    setBusy(true);
    setError(null);
    setVerdict(null);

    // Best-effort GPS — clocking must still work if the phone says no.
    let lat: number | null = null;
    let lng: number = null!;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 60_000 }),
      );
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch {
      /* no GPS — event will be logged as unchecked */
    }

    const eventId = crypto.randomUUID();
    const body = {
      event_type: type,
      work_order_id: type === "clock_in" ? assignment?.work_order_id ?? null : null,
      site_id: type === "clock_in" ? assignment?.site_id ?? null : null,
      shift_id: type === "clock_in" ? assignment?.shift_id ?? null : null,
      gps_lat: lat,
      gps_lng: lat === null ? null : lng,
      event_id: eventId,
      source: "web",
    };

    try {
      // Preferred path: edge function computes the geofence verdict server-side.
      const { data, error: fnErr } = await getSupabase().functions.invoke("attendance-geofence", { body });
      if (fnErr) throw fnErr;
      const res = data as { id?: string; geofence_result?: string; verdict?: string } | null;
      const v = res?.geofence_result ?? res?.verdict ?? null;
      setVerdict(v ? `Location check: ${statusLabel(v)}` : "Recorded.");
    } catch {
      // Fallback: call the clock_event RPC directly (no geofence verdict).
      const { error: rpcErr } = await getSupabase().rpc("hericilla_clock_event", {
        p_type: type,
        p_work_order: body.work_order_id,
        p_site: body.site_id,
        p_shift: body.shift_id,
        p_gps_lat: lat,
        p_gps_lng: lat === null ? null : lng,
        p_event_id: eventId,
        p_source: "web",
      });
      if (rpcErr) {
        setError(
          rpcErr.message.includes("already clocked in")
            ? "You are already clocked in for this job today. Press Clock out instead."
            : "Could not record: " + rpcErr.message,
        );
      } else {
        setVerdict("Recorded (location not checked).");
      }
    }
    setBusy(false);
    void qc.invalidateQueries({ queryKey: ["my-last-event", today] });
  }

  const greeting = profile?.full_name?.split(" ")[0] ?? "there";

  return (
    <div>
      <PageHeader
        title={`Good day, ${greeting}`}
        purpose="This is your day at work: clock in and out here, see your shift and what the office announced."
      />

      {/* Clock card — the one big action */}
      <Card className="mt-6">
        <h2 className="text-xl font-bold text-brand-950">
          {nextAction === "clock_in"
            ? "Ready to start? Clock in below."
            : nextAction === "clock_out"
              ? "You are clocked in. Clock out when you finish."
              : "You are on break. End it when you are back."}
        </h2>
        <p className="text-lg text-ink-soft mt-1">
          {lastEvent
            ? `Last action: ${statusLabel(lastEvent.event_type)} at ${new Date(lastEvent.event_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Nothing recorded yet today."}
        </p>

        {(assignments ?? []).length > 1 && nextAction === "clock_in" && (
          <div className="mt-4">
            <p className="text-lg font-semibold">Which job are you starting on?</p>
            <div className="mt-2 flex gap-3 flex-wrap">
              {(assignments ?? []).map((a) => (
                <BigButton
                  key={a.id}
                  size="md"
                  variant={assignment?.id === a.id ? "primary" : "secondary"}
                  onClick={() => setChosen(a.id)}
                >
                  {a.shift_name ?? "Shift"}
                </BigButton>
              ))}
            </div>
          </div>
        )}
        {(assignments ?? []).length === 1 && (
          <p className="mt-3 text-lg">
            Today’s shift: <strong>{assignments![0].shift_name ?? "assigned shift"}</strong>
            {assignments![0].start_time ? ` (${assignments![0].start_time!.slice(0, 5)} – ${assignments![0].end_time?.slice(0, 5)})` : ""}
          </p>
        )}
        {(assignments ?? []).length === 0 && (
          <p className="mt-3 text-lg text-warning-800">You have no shift assigned for today. You can still clock in — it will be recorded without a shift.</p>
        )}

        <div className="mt-6 flex flex-wrap gap-4">
          {nextAction === "clock_in" && (
            <BigButton size="lg" variant="success" disabled={busy} onClick={() => void doClock("clock_in")}>
              {busy ? "Recording…" : "▶  Clock In"}
            </BigButton>
          )}
          {nextAction === "clock_out" && (
            <>
              <BigButton size="lg" variant="danger" disabled={busy} onClick={() => void doClock("clock_out")}>
                {busy ? "Recording…" : "⏹  Clock Out"}
              </BigButton>
              <BigButton size="lg" variant="secondary" disabled={busy} onClick={() => void doClock("break_start")}>
                Start Break
              </BigButton>
            </>
          )}
          {nextAction === "break_end" && (
            <BigButton size="lg" variant="primary" disabled={busy} onClick={() => void doClock("break_end")}>
              {busy ? "Recording…" : "I am back — End Break"}
            </BigButton>
          )}
        </div>

        {verdict && <p className="mt-4 text-lg font-semibold text-success-800">✓ {verdict}</p>}
        {error && <p className="mt-4 text-lg font-semibold text-danger-800">{error}</p>}
        <p className="mt-4 text-base text-ink-soft">
          We ask for your location when you clock, to confirm you reached the site. It is stored only with that clock record.
        </p>
      </Card>

      {/* Quick links */}
      <div className="mt-6 flex gap-4 flex-wrap">
        <Link href="/attendance" className="text-lg font-bold text-brand-800 underline">My timesheet</Link>
        <Link href="/tasks" className="text-lg font-bold text-brand-800 underline">My tasks</Link>
        <Link href="/workspace" className="text-lg font-bold text-brand-800 underline">My work queue</Link>
        <Link href="/leave" className="text-lg font-bold text-brand-800 underline">Ask for leave</Link>
        <Link href="/payslips" className="text-lg font-bold text-brand-800 underline">My payslips</Link>
      </div>

      {/* Announcements */}
      <section className="mt-10">
        <h2 className="text-xl font-bold text-brand-950 mb-3">Announcements</h2>
        {(announcements ?? []).length === 0 ? (
          <EmptyState title="Nothing announced yet" teach="When the office sends a message to all staff, it appears here." />
        ) : (
          <div className="space-y-3">
            {(announcements ?? []).map((a) => (
              <RowCard key={a.id} title={a.title} subtitle={`${a.body} · ${new Date(a.created_at).toLocaleDateString()}`} badge={<StatusBadge status="active" />} />
            ))}
          </div>
        )}
      </section>

      <div className="mt-8">
        <Skeleton className="h-0" />
      </div>
    </div>
  );
}
