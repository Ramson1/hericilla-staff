"use client";

import { useQuery } from "@tanstack/react-query";
import {
  PageHeader,
  HintCard,
  StatusBadge,
  Skeleton,
  EmptyState,
  Card,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { useAuth } from "@/lib/auth";

type Payslip = {
  id: string;
  payroll_run_id: string;
  base_salary: number;
  hours_worked: number;
  overtime_hours: number;
  overtime_amount: number;
  allowances_amount: number;
  deductions_amount: number;
  statutory_deductions: number;
  adjustment_amount: number;
  adjustment_reason: string | null;
  gross: number;
  net: number;
  payment_status: string;
  paid_at: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  run?: { period_month: string } | null;
};

const naira = (n: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(n) || 0);

export default function StaffPayslipsPage() {
  const { profile } = useAuth();

  const { data: rows, isPending } = useQuery({
    queryKey: ["my-payslips", profile?.id],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_payslips")
        .select("*, run:hericilla_payroll_runs!payslips_payroll_run_id_fkey(period_month)")
        .eq("employee_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(24);
      const pick = <T,>(v: unknown): T | null => (v == null ? null : Array.isArray(v) ? ((v[0] as T) ?? null) : (v as T));
      return ((data as Payslip[]) ?? []).map((r) => ({
        ...r,
        run: pick<{ period_month: string }>((r as unknown as { run: unknown }).run),
      }));
    },
    enabled: !!profile,
  });

  return (
    <div>
      <PageHeader
        title="My Payslips"
        purpose="Every salary payment made to you, with what went in and what came out. Only you can see these."
      />
      <HintCard
        steps={[
          "Each card is one month — the top right shows whether the money has been paid.",
          "“Waiting for approval” means Finance has not released the money yet.",
          "If a figure looks wrong, talk to HR with the month you are asking about.",
        ]}
      />

      {isPending ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (rows ?? []).length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No payslips yet"
            teach="Salaries are calculated at the end of each month from your approved attendance. The first payslip will appear here automatically."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {(rows ?? []).map((p) => {
            const month = p.run?.period_month
              ? new Date(p.run.period_month + "T12:00:00").toLocaleDateString([], { month: "long", year: "numeric" })
              : "Salary";
            return (
              <Card key={p.id} className="p-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="text-xl font-bold text-brand-950">{month}</h2>
                  <span className="flex gap-2 items-center flex-wrap">
                    <StatusBadge status={p.payment_status} />
                    {p.payment_status === "paid" && p.paid_at && (
                      <span className="text-base text-ink-soft">on {new Date(p.paid_at + "T12:00:00").toLocaleDateString()}</span>
                    )}
                  </span>
                </div>
                <p className="mt-1 text-lg text-success-800 font-bold">Take home: {naira(p.net)}</p>
                <dl className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2 text-lg">
                  <div className="flex justify-between gap-4 border-b border-[var(--color-line)] pb-1">
                    <dt className="text-ink-soft">Base salary</dt>
                    <dd className="font-semibold">{naira(p.base_salary)}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-[var(--color-line)] pb-1">
                    <dt className="text-ink-soft">Hours worked</dt>
                    <dd className="font-semibold">{Number(p.hours_worked).toFixed(1)} h</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-[var(--color-line)] pb-1">
                    <dt className="text-ink-soft">Overtime ({Number(p.overtime_hours).toFixed(1)} h)</dt>
                    <dd className="font-semibold">{naira(p.overtime_amount)}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-[var(--color-line)] pb-1">
                    <dt className="text-ink-soft">Allowances</dt>
                    <dd className="font-semibold">{naira(p.allowances_amount)}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-[var(--color-line)] pb-1">
                    <dt className="text-ink-soft">Deductions</dt>
                    <dd className="font-semibold text-danger-800">− {naira(p.deductions_amount)}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-[var(--color-line)] pb-1">
                    <dt className="text-ink-soft">Statutory (PAYE/pension)</dt>
                    <dd className="font-semibold text-danger-800">− {naira(p.statutory_deductions)}</dd>
                  </div>
                  {Number(p.adjustment_amount) !== 0 && (
                    <div className="flex justify-between gap-4 border-b border-[var(--color-line)] pb-1 sm:col-span-2">
                      <dt className="text-ink-soft">Adjustment{p.adjustment_reason ? ` — ${p.adjustment_reason}` : ""}</dt>
                      <dd className="font-semibold">{naira(p.adjustment_amount)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-4 sm:col-span-2">
                    <dt className="font-bold">Gross pay</dt>
                    <dd className="font-bold">{naira(p.gross)}</dd>
                  </div>
                </dl>
                {p.payment_method && (
                  <p className="mt-3 text-base text-ink-soft">
                    Paid by {p.payment_method.replace(/_/g, " ")}
                    {p.payment_reference ? ` · Ref: ${p.payment_reference}` : ""}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
