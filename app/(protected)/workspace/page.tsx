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
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { statusLabel } from "@hericilla/types";
import { useAuth } from "@/lib/auth";

/**
 * Role-specific work queues (master plan: staff portal "My Workspace").
 * These are filtered views over the same tables the admin portal uses —
 * the rows a staff member sees are decided by RLS, not by this screen.
 */

type ApprovalRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  required_role: string;
  requested_by: string | null;
  reason: string | null;
  created_at: string;
};
type LeaveRow = { id: string; employee_id: string; leave_type: string; start_date: string; end_date: string; reason: string | null };
type CorrRow = {
  id: string;
  employee_id: string;
  work_date: string;
  kind: string;
  requested_event_type: string;
  requested_time: string;
  reason: string;
  requested_by: string | null;
};
type ExpenseRow = { id: string; amount: number; description: string | null; occurred_at: string; category: string };
type PrRow = { id: string; ref_no: string; description: string | null; status: string; need_by_date: string | null; estimated_cost: number | null };
type JobRow = { id: string; ref_no: string; pickup_location: string; destination: string; scheduled_at: string | null; status: string };
type AlertRow = {
  item_id: string;
  on_hand: number;
  min_level: number;
  alerted_at: string;
  item?: { name: string } | null;
};

const OPS_STAFF_ROLES = ["supervisor", "procurement_officer", "finance_officer", "logistics_officer", "warehouse_agent", "hr_officer"] as const;

export default function StaffWorkspacePage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const role = profile?.role ?? "";
  const hasWorkspace = (OPS_STAFF_ROLES as readonly string[]).includes(role);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: approvals, isPending } = useQuery({
    queryKey: ["approvals-for-me", role],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_approvals")
        .select("*")
        .eq("status", "pending")
        .eq("required_role", role)
        .neq("requested_by", profile!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      return (data as ApprovalRow[]) ?? [];
    },
    enabled: !!profile && hasWorkspace,
  });

  const { data: leavePending } = useQuery({
    queryKey: ["leave-pending", role],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_leave_requests")
        .select("*")
        .eq("status", "pending")
        .order("start_date", { ascending: true })
        .limit(30);
      return (data as LeaveRow[]) ?? [];
    },
    enabled: !!profile && (role === "supervisor" || role === "hr_officer"),
  });

  const { data: corrPending } = useQuery({
    queryKey: ["corrections-pending", role],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_attendance_corrections")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(30);
      return (data as CorrRow[]) ?? [];
    },
    enabled: !!profile && role === "supervisor",
  });

  const { data: expensesPending } = useQuery({
    queryKey: ["expenses-pending", role],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_expenses")
        .select("*")
        .eq("status", "pending")
        .order("occurred_at", { ascending: true })
        .limit(40);
      return (data as ExpenseRow[]) ?? [];
    },
    enabled: !!profile && (role === "finance_officer" || role === "supervisor"),
  });

  const { data: prs } = useQuery({
    queryKey: ["prs-open", role],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_purchase_requests")
        .select("*")
        .in("status", ["submitted", "quoting", "pending_approval", "approved"])
        .order("created_at", { ascending: true })
        .limit(40);
      return (data as PrRow[]) ?? [];
    },
    enabled: !!profile && (role === "procurement_officer" || role === "warehouse_agent" || role === "supervisor"),
  });

  const { data: jobs } = useQuery({
    queryKey: ["jobs-open", role],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_transport_jobs")
        .select("*")
        .not("status", "in", "('{delivered,verified,closed}')")
        .order("scheduled_at", { ascending: true })
        .limit(40);
      return (data as JobRow[]) ?? [];
    },
    enabled: !!profile && (role === "logistics_officer" || role === "supervisor"),
  });

  const { data: alerts } = useQuery({
    queryKey: ["reorder-alerts-view", role],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_reorder_alerts")
        .select("*, inventory_items:hericilla_inventory_items(name)")
        .order("alerted_at", { ascending: false })
        .limit(40);
      const pick = <T,>(v: unknown): T | null => (v == null ? null : Array.isArray(v) ? ((v[0] as T) ?? null) : (v as T));
      return ((data as AlertRow[]) ?? []).map((r) => ({
        ...r,
        item: pick<{ name: string }>((r as unknown as { inventory_items: unknown }).inventory_items),
      }));
    },
    enabled: !!profile && (role === "warehouse_agent" || role === "procurement_officer"),
  });

  async function decideApproval(a: ApprovalRow, approved: boolean) {
    setBusyId(a.id);
    setError(null);
    const { error: err } = await getSupabase()
      .from("hericilla_approvals")
      .update({ status: approved ? "approved" : "rejected", decided_by: profile!.id, decided_at: new Date().toISOString() })
      .eq("id", a.id);
    if (err) setError("Could not record your decision: " + err.message);
    // Keep the business row in step (purchase requests only — expenses and
    // corrections have their own decide buttons below).
    if (!err && a.entity_type === "purchase_request") {
      await getSupabase().from("hericilla_purchase_requests").update({ status: approved ? "approved" : "rejected" }).eq("id", a.entity_id);
    }
    setBusyId(null);
    void qc.invalidateQueries({ queryKey: ["approvals-for-me", role] });
    void qc.invalidateQueries({ queryKey: ["prs-open", role] });
  }

  async function decideLeave(id: string, approved: boolean) {
    setBusyId(id);
    const { error: err } = await getSupabase()
      .from("hericilla_leave_requests")
      .update({ status: approved ? "approved" : "rejected", decided_by: profile!.id, decided_at: new Date().toISOString() })
      .eq("id", id);
    if (err) setError("Could not decide: " + err.message);
    setBusyId(null);
    void qc.invalidateQueries({ queryKey: ["leave-pending", role] });
  }

  async function decideCorrection(c: CorrRow, approved: boolean) {
    setBusyId(c.id);
    const s = getSupabase();
    let err: { message: string } | null = null;
    if (approved) {
      const r = await s.rpc("hericilla_approve_attendance_correction", { c_id: c.id });
      err = r.error;
    } else {
      const r = await s
        .from("hericilla_attendance_corrections")
        .update({ status: "rejected", decided_by: profile!.id, decided_at: new Date().toISOString() })
        .eq("id", c.id);
      err = r.error;
    }
    if (err) setError("Could not decide: " + err.message);
    setBusyId(null);
    void qc.invalidateQueries({ queryKey: ["corrections-pending", role] });
  }

  async function decideExpense(id: string, approved: boolean) {
    setBusyId(id);
    const { error: err } = await getSupabase()
      .from("hericilla_expenses")
      .update({ status: approved ? "approved" : "rejected", approved_by: profile!.id, approved_at: new Date().toISOString() })
      .eq("id", id);
    if (err) setError("Could not decide: " + err.message);
    setBusyId(null);
    void qc.invalidateQueries({ queryKey: ["expenses-pending", role] });
  }

  if (!hasWorkspace) {
    return (
      <div>
        <PageHeader title="My Work" purpose="The work queue your role is responsible for." />
        <div className="mt-6">
          <EmptyState
            title="Nothing to show here for your role"
            teach="Your work is on the My Tasks page. When the office gives your department a queue, the items appear here."
          />
        </div>
        <div className="mt-4">
          <BigButton variant="secondary" onClick={() => (window.location.href = "/tasks")}>
            Go to My Tasks
          </BigButton>
        </div>
      </div>
    );
  }

  const sections: { title: string; purpose: string; empty: string; rows: React.ReactNode[] }[] = [];

  if ((approvals ?? []).length > 0) {
    sections.push({
      title: "Waiting for your approval",
      purpose: `Requests that need a ${statusLabel(role)} — you cannot see requests you raised yourself.`,
      empty: "",
      rows: (approvals ?? []).map((a) => (
        <RowCard
          key={a.id}
          title={`Approve this ${a.entity_type.replace(/_/g, " ")}?`}
          subtitle={`${a.reason ?? "No reason given"} · waiting since ${new Date(a.created_at).toLocaleDateString()}`}
          badge={<StatusBadge status="pending" />}
          actions={
            <span className="flex gap-2 flex-wrap">
              <BigButton size="md" variant="success" disabled={busyId === a.id} onClick={() => void decideApproval(a, true)}>
                Approve
              </BigButton>
              <BigButton size="md" variant="danger" disabled={busyId === a.id} onClick={() => void decideApproval(a, false)}>
                Reject
              </BigButton>
            </span>
          }
        />
      )),
    });
  }

  if (role === "supervisor" || role === "hr_officer") {
    sections.push({
      title: "Leave requests to answer",
      purpose: "Staff are waiting for a yes or no. Answer here — they get a notification.",
      empty: "No leave requests are waiting.",
      rows: (leavePending ?? []).map((l) => (
        <RowCard
          key={l.id}
          title={`${statusLabel(l.leave_type)} leave — ${new Date(l.start_date + "T12:00:00").toLocaleDateString()} to ${new Date(l.end_date + "T12:00:00").toLocaleDateString()}`}
          subtitle={(l.reason ?? "No reason given") + ` · from ${new Date(l.start_date).toLocaleDateString()}`}
          badge={<StatusBadge status="pending" />}
          actions={
            <span className="flex gap-2 flex-wrap">
              <BigButton size="md" variant="success" disabled={busyId === l.id} onClick={() => void decideLeave(l.id, true)}>
                Approve
              </BigButton>
              <BigButton size="md" variant="danger" disabled={busyId === l.id} onClick={() => void decideLeave(l.id, false)}>
                Reject
              </BigButton>
            </span>
          }
        />
      )),
    });
  }

  if (role === "supervisor") {
    sections.push({
      title: "Attendance corrections to answer",
      purpose: "Timesheet fixes staff asked for. Approving writes a new clock record — the original is never changed.",
      empty: "No corrections are waiting.",
      rows: (corrPending ?? []).map((c) => (
        <RowCard
          key={c.id}
          title={`${statusLabel(c.kind)} — ${new Date(c.work_date + "T12:00:00").toLocaleDateString()}`}
          subtitle={`Add ${statusLabel(c.requested_event_type)} at ${new Date(c.requested_time).toLocaleString()} · reason: ${c.reason}`}
          badge={<StatusBadge status="pending" />}
          actions={
            <span className="flex gap-2 flex-wrap">
              <BigButton size="md" variant="success" disabled={busyId === c.id} onClick={() => void decideCorrection(c, true)}>
                Approve
              </BigButton>
              <BigButton size="md" variant="danger" disabled={busyId === c.id} onClick={() => void decideCorrection(c, false)}>
                Reject
              </BigButton>
            </span>
          }
        />
      )),
    });
  }

  if (role === "finance_officer" || role === "supervisor") {
    const naira = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(n) || 0);
    sections.push({
      title: "Expenses to approve",
      purpose: "Money spent that needs approval before it is booked.",
      empty: "No expenses are waiting for approval.",
      rows: (expensesPending ?? []).map((e) => (
        <RowCard
          key={e.id}
          title={`${naira(e.amount)} — ${e.description ?? statusLabel(e.category)}`}
          subtitle={`${statusLabel(e.category)} · occurred ${new Date(e.occurred_at + "T12:00:00").toLocaleDateString()}`}
          badge={<StatusBadge status="pending" />}
          actions={
            role === "finance_officer" ? (
              <span className="flex gap-2 flex-wrap">
                <BigButton size="md" variant="success" disabled={busyId === e.id} onClick={() => void decideExpense(e.id, true)}>
                  Approve
                </BigButton>
                <BigButton size="md" variant="danger" disabled={busyId === e.id} onClick={() => void decideExpense(e.id, false)}>
                  Reject
                </BigButton>
              </span>
            ) : (
              <span className="text-base text-ink-soft">Finance decides this one</span>
            )
          }
        />
      )),
    });
  }

  if (role === "procurement_officer" || role === "warehouse_agent" || role === "supervisor") {
    sections.push({
      title: "Purchase requests in progress",
      purpose: "Things the business asked to buy — get quotes, then send them for approval.",
      empty: "No purchase requests are open.",
      rows: (prs ?? []).map((p) => (
        <RowCard
          key={p.id}
          title={`${p.ref_no} — ${p.description ?? "Purchase request"}`}
          subtitle={`${statusLabel(p.status)}${p.need_by_date ? ` · needed by ${new Date(p.need_by_date + "T12:00:00").toLocaleDateString()}` : ""}${p.estimated_cost ? ` · est. ${new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(p.estimated_cost))}` : ""}`}
          badge={<StatusBadge status={p.status} />}
        />
      )),
    });
  }

  if (role === "logistics_officer" || role === "supervisor") {
    sections.push({
      title: "Deliveries still on the road",
      purpose: "Jobs that have not been delivered yet — check the driver has not gone quiet.",
      empty: "Every job is delivered. Good day.",
      rows: (jobs ?? []).map((j) => (
        <RowCard
          key={j.id}
          title={`${j.ref_no} — ${j.pickup_location} → ${j.destination}`}
          subtitle={j.scheduled_at ? `Scheduled ${new Date(j.scheduled_at).toLocaleString()}` : "No schedule set"}
          badge={<StatusBadge status={j.status} />}
        />
      )),
    });
  }

  if (role === "warehouse_agent" || role === "procurement_officer") {
    sections.push({
      title: "Stock running low",
      purpose: "Items at or below their minimum level. Raise a purchase request for these.",
      empty: "No shortages — stock is above every minimum.",
      rows: (alerts ?? []).map((a) => (
        <RowCard
          key={a.item_id}
          title={a.item?.name ?? "Item below minimum"}
          subtitle={`${a.on_hand} left · minimum is ${a.min_level} · flagged ${new Date(a.alerted_at).toLocaleDateString()}`}
          badge={<StatusBadge status="overdue" />}
        />
      )),
    });
  }

  const nothingYet = sections.length === 0;

  return (
    <div>
      <PageHeader
        title="My Work"
        purpose={`The queue a ${statusLabel(role)} handles. This is the same information the office sees — you only get the rows that are yours to act on.`}
      />
      <HintCard
        steps={[
          "Work from the top section down — those items are waiting on you personally.",
          "Approve or Reject with the big buttons; nothing here can be undone silently.",
          "If a section says it is empty, you are up to date.",
        ]}
      />

      {error && (
        <p className="mt-4 rounded-lg bg-danger-100 p-4 text-danger-800 font-semibold" role="alert">
          {error}
        </p>
      )}

      {isPending ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : nothingYet ? (
        <div className="mt-6">
          <Card className="text-center p-10">
            <p className="text-xl font-bold text-success-800">✓ Nothing is waiting on you</p>
            <p className="mt-2 text-lg text-ink-soft">
              New items appear here the moment your department has something to do — you will also get an alert in the bell.
            </p>
          </Card>
        </div>
      ) : (
        sections.map((s) => (
          <section key={s.title} className="mt-10">
            <h2 className="text-xl font-bold text-brand-950">{s.title}</h2>
            <p className="mt-1 text-lg text-ink-soft">{s.purpose}</p>
            <div className="mt-3 space-y-3">
              {s.rows.length === 0 ? (
                <p className="text-lg text-ink-soft">{s.empty}</p>
              ) : (
                s.rows.map((r, i) => <div key={i}>{r}</div>)
              )}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
