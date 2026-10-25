"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  HintCard,
  Card,
  RowCard,
  StatusBadge,
  Skeleton,
  EmptyState,
  BigButton,
  BigInput,
  BigTextarea,
  BigSelect,
  Modal,
  Wizard,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { LEAVE_TYPES, statusLabel } from "@hericilla/types";
import { useAuth } from "@/lib/auth";

type Daily = {
  employee_id: string;
  work_date: string;
  first_in: string | null;
  last_out: string | null;
  gross_hours: number | null;
  breaks_taken: number | null;
  start_time: string | null;
  end_time: string | null;
  day_status: string;
  is_late: boolean;
};
type Correction = {
  id: string;
  work_date: string;
  kind: string;
  requested_event_type: string;
  requested_time: string;
  reason: string;
  status: string;
  created_at: string;
};

const CORRECTION_KINDS = [
  { value: "missed_clock_in", label: "I forgot to clock in" },
  { value: "missed_clock_out", label: "I forgot to clock out" },
  { value: "wrong_time", label: "The time recorded is wrong" },
  { value: "other", label: "Something else" },
];

export default function StaffAttendancePage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: days, isPending } = useQuery({
    queryKey: ["my-timesheet", profile?.id],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      const { data } = await getSupabase()
        .from("hericilla_attendance_daily")
        .select("*")
        .eq("employee_id", profile!.id)
        .gte("work_date", since)
        .order("work_date", { ascending: false });
      return (data as Daily[]) ?? [];
    },
    enabled: !!profile,
  });

  const { data: corrections } = useQuery({
    queryKey: ["my-corrections", profile?.id],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_attendance_corrections")
        .select("*")
        .eq("employee_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data as Correction[]) ?? [];
    },
    enabled: !!profile,
  });

  // ----- correction request wizard state -----
  const [wDate, setWDate] = useState("");
  const [wKind, setWKind] = useState<string>("missed_clock_in");
  const [wEventType, setWEventType] = useState<"clock_in" | "clock_out">("clock_in");
  const [wTime, setWTime] = useState("");
  const [wReason, setWReason] = useState("");

  // When the problem is a missed clock-out, the event to add is obviously a clock-out.
  const effectiveEventType = wKind === "missed_clock_out" ? "clock_out" : wKind === "missed_clock_in" ? "clock_in" : wEventType;

  async function submitCorrection() {
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().from("hericilla_attendance_corrections").insert({
      employee_id: profile!.id,
      requested_by: profile!.id,
      work_date: wDate,
      kind: wKind,
      requested_event_type: effectiveEventType,
      requested_time: new Date(wTime).toISOString(),
      reason: wReason.trim(),
    });
    setBusy(false);
    if (err) {
      setError("Could not send the request: " + err.message);
      return;
    }
    setOpen(false);
    setWDate(""); setWKind("missed_clock_in"); setWEventType("clock_in"); setWTime(""); setWReason("");
    void qc.invalidateQueries({ queryKey: ["my-corrections", profile?.id] });
  }

  const fmtTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

  const wizardSteps = [
    {
      title: "Which day, and what happened?",
      content: (
        <div className="space-y-4">
          <BigInput label="Which day?" type="date" required value={wDate} onChange={(e) => setWDate(e.target.value)} />
          <BigSelect
            label="What went wrong?"
            options={CORRECTION_KINDS}
            value={wKind}
            onChange={(e) => setWKind(e.target.value)}
          />
        </div>
      ),
      valid: wDate.length > 0,
    },
    {
      title: "The correct time",
      content: (
        <div className="space-y-4">
          {wKind === "wrong_time" && (
            <BigSelect
              label="Which clock record is wrong?"
              options={[
                { value: "clock_in", label: "My clock-in" },
                { value: "clock_out", label: "My clock-out" },
              ]}
              value={wEventType}
              onChange={(e) => setWEventType(e.target.value as "clock_in" | "clock_out")}
            />
          )}
          <p className="text-lg text-ink-soft">
            Enter the time it should show: <strong>{statusLabel(effectiveEventType)}</strong> on your timesheet.
          </p>
          <BigInput
            label="Correct time"
            type="datetime-local"
            required
            value={wTime}
            onChange={(e) => setWTime(e.target.value)}
          />
        </div>
      ),
      valid: wTime.length > 0,
    },
    {
      title: "Reason",
      content: (
        <div className="space-y-4">
          <BigTextarea
            label="Why did this happen? (required — your supervisor reads this)"
            required
            value={wReason}
            onChange={(e) => setWReason(e.target.value)}
            rows={4}
          />
          {error && <p className="text-lg font-semibold text-danger-800">{error}</p>}
        </div>
      ),
      valid: wReason.trim().length >= 5,
    },
  ];

  return (
    <div>
      <PageHeader
        title="My Attendance"
        purpose="Your timesheet for the last 30 days. If a day looks wrong, send a correction request here — your supervisor decides it."
        actions={
          <BigButton variant="primary" onClick={() => setOpen(true)}>
            + Request a correction
          </BigButton>
        }
      />
      <HintCard
        steps={[
          "Check each day: green means your hours are complete.",
          "If a time is missing or wrong, press “Request a correction”.",
          "Fill the 3 short steps and press Send — you will see the answer here.",
        ]}
      />

      <section className="mt-8">
        <h2 className="text-xl font-bold text-brand-950 mb-3">Last 30 days</h2>
        {isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : (days ?? []).length === 0 ? (
          <EmptyState
            title="No attendance recorded yet"
            teach="When you clock in from the home page, your days appear here with the hours worked."
          />
        ) : (
          <div className="space-y-3">
            {(days ?? []).map((d) => (
              <RowCard
                key={d.work_date}
                title={new Date(d.work_date + "T12:00:00").toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
                subtitle={`In ${fmtTime(d.first_in)} · Out ${fmtTime(d.last_out)} · ${
                  d.gross_hours != null ? `${d.gross_hours.toFixed(1)} hours` : "hours not complete"
                }${d.breaks_taken ? ` · ${d.breaks_taken} break(s)` : ""}`}
                badge={
                  <span className="flex gap-2 flex-wrap">
                    {d.is_late && (
                      <span className="rounded-full bg-warning-100 px-3 py-1 text-base font-semibold text-warning-800">Started late</span>
                    )}
                    <StatusBadge status={d.day_status} />
                  </span>
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold text-brand-950 mb-3">My correction requests</h2>
        {(corrections ?? []).length === 0 ? (
          <p className="text-lg text-ink-soft">You have not asked for any corrections. That is a good thing.</p>
        ) : (
          <div className="space-y-3">
            {(corrections ?? []).map((c) => (
              <RowCard
                key={c.id}
                title={`${statusLabel(c.kind)} — ${new Date(c.work_date + "T12:00:00").toLocaleDateString()}`}
                subtitle={`Asked for ${statusLabel(c.requested_event_type)} at ${new Date(c.requested_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${c.reason}`}
                badge={<StatusBadge status={c.status} />}
              />
            ))}
          </div>
        )}
      </section>

      <Modal open={open} title="Request an attendance correction" onClose={() => setOpen(false)} wide>
        <Wizard steps={wizardSteps} onSubmit={() => void submitCorrection()} submitting={busy} submitLabel="Send request" />
      </Modal>
    </div>
  );
}
