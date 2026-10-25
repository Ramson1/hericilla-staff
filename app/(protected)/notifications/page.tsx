"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  HintCard,
  RowCard,
  Skeleton,
  EmptyState,
  BigButton,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { useWebPush } from "@hericilla/push-web";
import { useAuth } from "@/lib/auth";

type OutboxRow = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  seen?: boolean;
};

export default function StaffNotificationsPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { supported, subscribed, enableNotifications, error: pushError } = useWebPush();

  const { data, isPending } = useQuery({
    queryKey: ["my-notifications", profile?.id],
    queryFn: async () => {
      const { data: rows } = await getSupabase()
        .from("hericilla_notification_outbox")
        .select("*")
        .or(`recipient_user_id.eq.${profile?.id},role_target.eq.${profile?.role}`)
        .order("created_at", { ascending: false })
        .limit(100);
      const list = (rows as OutboxRow[]) ?? [];
      if (list.length === 0) return [];
      const { data: seenRows } = await getSupabase()
        .from("hericilla_notifications_seen")
        .select("outbox_id")
        .eq("user_id", profile!.id)
        .in("outbox_id", list.map((r) => r.id));
      const seenSet = new Set(((seenRows as { outbox_id: string }[]) ?? []).map((s) => s.outbox_id));
      return list.map((r) => ({ ...r, seen: seenSet.has(r.id) }));
    },
    enabled: !!profile,
  });

  async function markSeen(id: string) {
    await getSupabase()
      .from("hericilla_notifications_seen")
      .upsert({ outbox_id: id, user_id: profile!.id }, { onConflict: "outbox_id,user_id" });
    void qc.invalidateQueries({ queryKey: ["my-notifications", profile?.id] });
  }

  async function markAllSeen() {
    const unread = (data ?? []).filter((r) => !r.seen);
    if (unread.length === 0) return;
    await getSupabase()
      .from("hericilla_notifications_seen")
      .upsert(unread.map((r) => ({ outbox_id: r.id, user_id: profile!.id })), { onConflict: "outbox_id,user_id" });
    void qc.invalidateQueries({ queryKey: ["my-notifications", profile?.id] });
  }

  const unread = (data ?? []).filter((r) => !r.seen);

  return (
    <div>
      <PageHeader
        title="Notifications"
        purpose="Everything the system has told you — leave answers, task assignments, announcements. Nothing is deleted, so you can always come back to read it."
        actions={
          unread.length > 0 ? (
            <BigButton variant="secondary" onClick={() => void markAllSeen()}>
              Mark all as read ({unread.length})
            </BigButton>
          ) : undefined
        }
      />
      <HintCard
        steps={[
          "A dot (●) means you have not read it yet.",
          "Press a message once to mark it read.",
          "Turn on browser notifications below if you want a pop-up even with this tab closed.",
        ]}
      />

      {supported && subscribed !== true && (
        <div className="mt-6 rounded-[var(--radius-card)] bg-brand-100 p-5 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-lg text-brand-950">Want a pop-up even when this tab is closed? Turn on browser notifications.</p>
          <BigButton onClick={() => void enableNotifications()}>Turn on notifications</BigButton>
          {pushError && <p className="text-base text-danger-800 w-full">{pushError}</p>}
        </div>
      )}
      {subscribed === true && (
        <p className="mt-6 text-lg text-success-800">✓ Browser notifications are on for this device.</p>
      )}

      {isPending ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No messages yet"
            teach="When your leave request is answered or a task is given to you, it appears here — and in the bell on every page."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {(data ?? []).map((r) => (
            <RowCard
              key={r.id}
              title={(r.seen ? "" : "● ") + r.title}
              subtitle={`${r.body} · ${new Date(r.created_at).toLocaleString()}`}
              onClick={() => !r.seen && void markSeen(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
