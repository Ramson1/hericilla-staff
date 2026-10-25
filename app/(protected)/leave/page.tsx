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
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { LEAVE_TYPES, statusLabel } from "@hericilla/types";
import { useAuth } from "@/lib/auth";

type Leave = {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  decided_at: string | null;
  created_at: string;
};

const LEAVE_OPTIONS = LEAVE_TYPES.map((t) => ({ value: t, label: statusLabel(t) }));

export default function StaffLeavePage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [type, setType] = useState<string>("annual");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const { data: rows, isPending } = useQuery({
    queryKey: ["my-leave", profile?.id],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_leave_requests")
        .select("*")
        .eq("employee_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      return (data as Leave[]) ?? [];
    },
    enabled: !!profile,
  });

  const datesOk = start.length > 0 && end.length > 0 && end >= start;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!datesOk) {
      setError("Please check the dates — the last day cannot be before the first day.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().from("hericilla_leave_requests").insert({
      employee_id: profile!.id,
      requested_by: profile!.id,
      leave_type: type,
      start_date: start,
      end_date: end,
      reason: reason.trim() || null,
    });
    setBusy(false);
    if (err) {
      setError("Could not send your request: " + err.message);
      return;
    }
    setStart(""); setEnd(""); setReason(""); setSent(true);
    setTimeout(() => setSent(false), 6000);
    void qc.invalidateQueries({ queryKey: ["my-leave", profile?.id] });
  }

  return (
    <div>
      <PageHeader
        title="My Leave"
        purpose="Ask for time off here and see what your supervisor decided. Answers appear in this list — you will also get a notification."
      />

      <Card className="mt-6">
        <h2 className="text-xl font-bold text-brand-950">Request leave</h2>
        <form className="mt-4 space-y-5" onSubmit={submit}>
          <BigSelect label="Type of leave" options={LEAVE_OPTIONS} value={type} onChange={(e) => setType(e.target.value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <BigInput label="First day off" type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
            <BigInput
              label="Last day off"
              type="date"
              required
              value={end}
              min={start || undefined}
              onChange={(e) => setEnd(e.target.value)}
              error={end && end < start ? "This must be the same day or later than the first day" : undefined}
            />
          </div>
          <BigTextarea
            label="Reason (optional, but it helps your supervisor decide)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          {error && (
            <p className="rounded-lg bg-danger-100 p-4 text-danger-800 font-semibold" role="alert">
              {error}
            </p>
          )}
          {sent && (
            <p className="rounded-lg bg-success-100 p-4 text-success-800 font-semibold">✓ Sent — it is now with your supervisor.</p>
          )}
          <BigButton type="submit" size="lg" disabled={busy || !datesOk}>
            {busy ? "Sending…" : "Send request to supervisor"}
          </BigButton>
        </form>
      </Card>

      <section className="mt-10">
        <h2 className="text-xl font-bold text-brand-950 mb-3">My requests</h2>
        {isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : (rows ?? []).length === 0 ? (
          <EmptyState
            title="You have not requested leave"
            teach="Fill the form above and press Send. Your request will appear here marked “Waiting for approval”."
          />
        ) : (
          <div className="space-y-3">
            {(rows ?? []).map((l) => (
              <RowCard
                key={l.id}
                title={`${statusLabel(l.leave_type)} leave — ${new Date(l.start_date + "T12:00:00").toLocaleDateString()} to ${new Date(l.end_date + "T12:00:00").toLocaleDateString()}`}
                subtitle={(l.reason ? l.reason + " · " : "") + (l.decided_at ? `Decided ${new Date(l.decided_at).toLocaleDateString()}` : `Requested ${new Date(l.created_at).toLocaleDateString()}`)}
                badge={<StatusBadge status={l.status} />}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
