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
  BigTextarea,
  Modal,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { useAuth } from "@/lib/auth";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  progress_note: string | null;
  work_order_id: string | null;
  updated_at: string;
};

export default function StaffTasksPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [editing, setEditing] = useState<Task | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: tasks, isPending } = useQuery({
    queryKey: ["my-tasks", profile?.id],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_tasks")
        .select("*")
        .eq("assigned_to", profile!.id)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      return (data as Task[]) ?? [];
    },
    enabled: !!profile,
  });

  // Can this user see a supervisor to escalate to? (Staff cannot read the full
  // directory, so the directory query simply returns nothing for most staff —
  // the button then stays hidden and no error is shown.)
  const { data: supervisors } = useQuery({
    queryKey: ["supervisors-near", profile?.department_id],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_profiles")
        .select("id, full_name, role")
        .eq("role", "supervisor")
        .eq("status", "active")
        .limit(5);
      return (data as { id: string; full_name: string }[]) ?? [];
    },
    enabled: !!profile,
  });

  async function setStatus(task: Task, status: string) {
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase()
      .from("hericilla_tasks")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", task.id);
    setBusy(false);
    if (err) setError("Could not save: " + err.message);
    void qc.invalidateQueries({ queryKey: ["my-tasks", profile?.id] });
  }

  async function saveNoteAndStatus(status?: string) {
    if (!editing) return;
    setBusy(true);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (note !== (editing.progress_note ?? "")) patch.progress_note = note;
    if (status) patch.status = status;
    const { error: err } = await getSupabase().from("hericilla_tasks").update(patch).eq("id", editing.id);
    setBusy(false);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    setEditing(null);
    void qc.invalidateQueries({ queryKey: ["my-tasks", profile?.id] });
  }

  async function escalate(task: Task) {
    const sup = (supervisors ?? [])[0];
    if (!sup) return;
    setBusy(true);
    const { error: err } = await getSupabase()
      .from("hericilla_tasks")
      .update({ escalated_to: sup.id, status: "blocked", updated_at: new Date().toISOString() })
      .eq("id", task.id);
    setBusy(false);
    if (err) setError("Could not escalate: " + err.message);
    void qc.invalidateQueries({ queryKey: ["my-tasks", profile?.id] });
  }

  const openTasks = (tasks ?? []).filter((t) => t.status !== "done");
  const doneTasks = (tasks ?? []).filter((t) => t.status === "done").slice(0, 10);
  const today = new Date(Date.now() + 3600_000).toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title="My Tasks"
        purpose="Work the office has assigned to you. Update the status as you go — this is how your supervisor sees progress."
      />
      <HintCard
        steps={[
          "Read the task, then press the button that matches where you are.",
          "If something stops you, press “Mark blocked” and write what is stopping you.",
          "Overdue tasks show a red date — do those first.",
        ]}
      />

      {error && <p className="mt-4 text-base font-semibold text-danger-800">{error}</p>}

      {isPending ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : openTasks.length === 0 && doneTasks.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No tasks assigned to you"
            teach="When the office gives you work, it appears here with a big button for each step."
          />
        </div>
      ) : (
        <>
          <section className="mt-6 space-y-4">
            {openTasks.map((t) => {
              const overdue = t.due_date !== null && t.due_date < today && t.status !== "done";
              return (
                <Card key={t.id} className={overdue ? "border-2 border-danger-600" : ""}>
                  <RowCard
                    title={t.title}
                    subtitle={
                      (t.description ? t.description + " · " : "") +
                      (t.due_date
                        ? `Due ${new Date(t.due_date + "T12:00:00").toLocaleDateString()}${overdue ? " — OVERDUE" : ""}`
                        : "No deadline") +
                      (t.progress_note ? ` · Last note: ${t.progress_note}` : "")
                    }
                    badge={
                      <span className="flex gap-2 flex-wrap">
                        <StatusBadge status={t.priority} />
                        <StatusBadge status={t.status} />
                      </span>
                    }
                  />
                  <div className="mt-4 flex flex-wrap gap-3">
                    {t.status === "open" && (
                      <BigButton size="md" disabled={busy} onClick={() => void setStatus(t, "in_progress")}>
                        ▶ Start working
                      </BigButton>
                    )}
                    {t.status !== "done" && (
                      <BigButton
                        size="md"
                        variant="success"
                        disabled={busy}
                        onClick={() => {
                          setEditing(t);
                          setNote(t.progress_note ?? "");
                          setError(null);
                        }}
                      >
                        ✓ Finish / add note
                      </BigButton>
                    )}
                    {t.status !== "blocked" && t.status !== "done" && (supervisors ?? []).length > 0 && (
                      <BigButton size="md" variant="secondary" disabled={busy} onClick={() => void escalate(t)}>
                        ⚠ I am stuck — tell my supervisor
                      </BigButton>
                    )}
                  </div>
                </Card>
              );
            })}
          </section>

          {doneTasks.length > 0 && (
            <section className="mt-10">
              <h2 className="text-lg font-bold text-brand-950 mb-3">Recently finished</h2>
              <div className="space-y-3">
                {doneTasks.map((t) => (
                  <RowCard key={t.id} title={t.title} subtitle={t.description ?? undefined} badge={<StatusBadge status="done" />} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <Modal open={!!editing} title={editing?.title ?? ""} onClose={() => setEditing(null)}>
        <div className="space-y-5">
          <BigTextarea
            label="Progress note (what did you do? write one clear sentence)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
          />
          <div className="flex flex-wrap gap-3 justify-end">
            <BigButton variant="secondary" disabled={busy} onClick={() => void saveNoteAndStatus("in_progress")}>
              Save note — still working
            </BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void saveNoteAndStatus("done")}>
              Save and mark Done
            </BigButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
