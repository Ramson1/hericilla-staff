"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  HintCard,
  Card,
  RowCard,
  Skeleton,
  EmptyState,
  BigButton,
  BigInput,
  Modal,
  ConfirmDialog,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { statusLabel } from "@hericilla/types";
import { useAuth } from "@/lib/auth";

type Cert = {
  id: string;
  name: string;
  issued_by: string | null;
  issued_at: string | null;
  expiry_date: string | null;
  status: string;
};

const daysUntil = (d: string) => Math.ceil((new Date(d + "T12:00:00").getTime() - Date.now()) / 86_400_000);

export default function StaffProfilePage() {
  const qc = useQueryClient();
  const { profile, refresh } = useAuth();
  const [phone, setPhone] = useState("");
  const [homeBase, setHomeBase] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Bank/payroll details
  const [bankName, setBankName] = useState("");
  const [acctName, setAcctName] = useState("");
  const [acctNo, setAcctNo] = useState("");
  const [pensionPin, setPensionPin] = useState("");
  const [bankTouched, setBankTouched] = useState(false);

  const { data: sd, isPending: sdPending } = useQuery({
    queryKey: ["my-staff-details", profile?.id],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_staff_details")
        .select("*")
        .eq("profile_id", profile!.id)
        .maybeSingle();
      return (data as {
        profile_id: string;
        grade: string | null;
        bank_name: string | null;
        bank_account_name: string | null;
        bank_account_no: string | null;
        pension_pin: string | null;
        next_of_kin_name: string | null;
        next_of_kin_phone: string | null;
      } | null) ?? null;
    },
    enabled: !!profile,
  });

  const { data: certs } = useQuery({
    queryKey: ["my-certs", profile?.id],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_staff_certifications")
        .select("*")
        .eq("profile_id", profile!.id)
        .order("expiry_date", { ascending: true, nullsFirst: false });
      return (data as Cert[]) ?? [];
    },
    enabled: !!profile,
  });

  // Documents addressed to this person (contract letters, pay slips notices…).
  // RLS lets staff read only their own or the ones they uploaded.
  const { data: myDocs } = useQuery({
    queryKey: ["my-documents", profile?.id],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_documents")
        .select("id, title, doc_type, file_path, storage_bucket, created_at")
        .eq("profile_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return (
        (data as {
          id: string;
          title: string;
          doc_type: string;
          file_path: string | null;
          storage_bucket: string | null;
          created_at: string;
        }[]) ?? []
      );
    },
    enabled: !!profile,
  });

  async function openDoc(path: string | null, bucket: string | null) {
    if (!path) return;
    setError(null);
    const { data, error: err } = await getSupabase().storage.from(bucket ?? "hericilla-documents").createSignedUrl(path, 600);
    if (err || !data?.signedUrl) {
      setError("That file could not be opened: " + (err?.message ?? "no link returned"));
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  const { data: dept } = useQuery({
    queryKey: ["my-dept", profile?.department_id],
    queryFn: async () => {
      if (!profile?.department_id) return null;
      const { data } = await getSupabase().from("hericilla_departments").select("name").eq("id", profile.department_id).maybeSingle();
      return (data as { name: string } | null) ?? null;
    },
    enabled: !!profile?.department_id,
  });

  // Prefill contact fields from profile
  const pPhone = profile?.phone ?? "";
  const pBase = profile?.home_base ?? "";
  const effPhone = touched ? phone : pPhone;
  const effBase = touched ? homeBase : pBase;

  async function saveContact() {
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase()
      .from("hericilla_profiles")
      .update({ phone: effPhone.trim() || null, home_base: effBase.trim() || null })
      .eq("id", profile!.id);
    setBusy(false);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    setTouched(false);
    setSaved("Contact details saved.");
    setTimeout(() => setSaved(null), 5000);
    await refresh();
  }

  async function saveBank() {
    setBusy(true);
    setError(null);
    const payload = {
      profile_id: profile!.id,
      bank_name: bankName.trim() || null,
      bank_account_name: acctName.trim() || null,
      bank_account_no: acctNo.trim() || null,
      pension_pin: pensionPin.trim() || null,
      updated_at: new Date().toISOString(),
    };
    // staff_details PK is profile_id — upsert works whether the row exists or not.
    const { error: err } = await getSupabase().from("hericilla_staff_details").upsert(payload, { onConflict: "profile_id" });
    setBusy(false);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    setBankTouched(false);
    setSaved("Bank details saved. HR is notified of changes — expect a confirmation call.");
    setTimeout(() => setSaved(null), 6000);
    void qc.invalidateQueries({ queryKey: ["my-staff-details", profile?.id] });
  }

  // ----- certification modal -----
  const [certOpen, setCertOpen] = useState(false);
  const [cName, setCName] = useState("");
  const [cIssuer, setCIssuer] = useState("");
  const [cExpiry, setCExpiry] = useState("");
  const [deleting, setDeleting] = useState<Cert | null>(null);

  async function addCert() {
    setBusy(true);
    const { error: err } = await getSupabase().from("hericilla_staff_certifications").insert({
      profile_id: profile!.id,
      name: cName.trim(),
      issued_by: cIssuer.trim() || null,
      expiry_date: cExpiry || null,
    });
    setBusy(false);
    if (err) {
      setError("Could not add: " + err.message);
      return;
    }
    setCertOpen(false); setCName(""); setCIssuer(""); setCExpiry("");
    void qc.invalidateQueries({ queryKey: ["my-certs", profile?.id] });
  }

  async function deleteCert(c: Cert) {
    const { error: err } = await getSupabase().from("hericilla_staff_certifications").delete().eq("id", c.id);
    setDeleting(null);
    if (err) setError("Could not delete: " + err.message);
    void qc.invalidateQueries({ queryKey: ["my-certs", profile?.id] });
  }

  return (
    <div>
      <PageHeader
        title="My Profile"
        purpose="Your personal details. Keep your phone number and bank details current — payroll and your supervisor depend on them."
      />

      {error && (
        <p className="mt-4 rounded-lg bg-danger-100 p-4 text-danger-800 font-semibold" role="alert">
          {error}
        </p>
      )}
      {saved && <p className="mt-4 rounded-lg bg-success-100 p-4 text-success-800 font-semibold">✓ {saved}</p>}

      {/* Identity (read-only) */}
      <Card className="mt-6 p-5">
        <h2 className="text-lg font-bold text-brand-950">Who you are</h2>
        <dl className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2 text-base">
          <div className="flex justify-between gap-4 border-b border-[var(--color-line)] pb-1">
            <dt className="text-ink-soft">Full name</dt>
            <dd className="font-semibold">{profile?.full_name}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-[var(--color-line)] pb-1">
            <dt className="text-ink-soft">Work email</dt>
            <dd className="font-semibold">{profile?.email}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-[var(--color-line)] pb-1">
            <dt className="text-ink-soft">Role</dt>
            <dd className="font-semibold">{profile ? statusLabel(profile.role) : ""}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-[var(--color-line)] pb-1">
            <dt className="text-ink-soft">Department</dt>
            <dd className="font-semibold">{dept?.name ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-[var(--color-line)] pb-1">
            <dt className="text-ink-soft">Employee number</dt>
            <dd className="font-semibold">{profile?.employee_no ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-[var(--color-line)] pb-1">
            <dt className="text-ink-soft">Grade</dt>
            <dd className="font-semibold">{sd?.grade ?? "—"}</dd>
          </div>
        </dl>
        <p className="mt-3 text-base text-ink-soft">
          Name, role, department and employee number are kept by HR — ask them if any of these are wrong.
        </p>
      </Card>

      {/* Contact (editable) */}
      <Card className="mt-6 p-5">
        <h2 className="text-lg font-bold text-brand-950">Contact details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <BigInput
            label="Phone number"
            type="tel"
            placeholder="080…"
            value={effPhone}
            onChange={(e) => {
              setPhone(e.target.value);
              setTouched(true);
            }}
          />
          <BigInput
            label="Home base (where you normally start work)"
            placeholder="e.g. Port Harcourt — Trans-Amadi"
            value={effBase}
            onChange={(e) => {
              setHomeBase(e.target.value);
              setTouched(true);
            }}
          />
        </div>
        <BigButton className="mt-4" disabled={busy || !touched} onClick={() => void saveContact()}>
          {busy ? "Saving…" : "Save contact details"}
        </BigButton>
      </Card>

      {/* Bank / payroll */}
      <Card className="mt-6 p-5">
        <h2 className="text-lg font-bold text-brand-950">Bank & payroll details</h2>
        {sdPending ? (
          <Skeleton className="mt-4 h-32" />
        ) : (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <BigInput
                label="Bank name"
                value={bankTouched ? bankName : (sd?.bank_name ?? "")}
                onChange={(e) => {
                  setBankName(e.target.value);
                  setBankTouched(true);
                }}
              />
              <BigInput
                label="Account name (must match your name)"
                value={bankTouched ? acctName : (sd?.bank_account_name ?? "")}
                onChange={(e) => {
                  setAcctName(e.target.value);
                  setBankTouched(true);
                }}
              />
              <BigInput
                label="Account number (10 digits)"
                inputMode="numeric"
                value={bankTouched ? acctNo : (sd?.bank_account_no ?? "")}
                onChange={(e) => {
                  setAcctNo(e.target.value);
                  setBankTouched(true);
                }}
                error={acctNo && !/^\d{10}$/.test(acctNo) ? "Nigerian account numbers are 10 digits" : undefined}
              />
              <BigInput
                label="Pension PIN (optional)"
                value={bankTouched ? pensionPin : (sd?.pension_pin ?? "")}
                onChange={(e) => {
                  setPensionPin(e.target.value);
                  setBankTouched(true);
                }}
              />
            </div>
            <BigButton className="mt-4" disabled={busy || !bankTouched || (acctNo !== "" && !/^\d{10}$/.test(acctNo))} onClick={() => void saveBank()}>
              {busy ? "Saving…" : "Save bank details"}
            </BigButton>
            <p className="mt-3 text-base text-ink-soft">
              For your safety, tell HR on the phone after changing bank details — they will confirm it before payroll runs.
            </p>
          </>
        )}
      </Card>

      {/* Certifications */}
      <section className="mt-10">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-brand-950">My licences & certificates</h2>
          <BigButton size="md" variant="secondary" onClick={() => setCertOpen(true)}>
            + Add certificate
          </BigButton>
        </div>
        <p className="mt-1 text-base text-ink-soft">Safety cards, licences, training certificates — with their expiry dates.</p>
        {(certs ?? []).length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No certificates recorded" teach="Add your safety cards and licences here so you get a reminder before they expire." />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {(certs ?? []).map((c) => {
              const expSoon = c.expiry_date !== null && daysUntil(c.expiry_date) <= 60;
              return (
                <RowCard
                  key={c.id}
                  title={c.name}
                  subtitle={
                    (c.issued_by ? `Issued by ${c.issued_by} · ` : "") +
                    (c.expiry_date ? `Expires ${new Date(c.expiry_date + "T12:00:00").toLocaleDateString()}` : "No expiry")
                  }
                  badge={
                    <span className="flex gap-2 flex-wrap">
                      {expSoon && (
                        <span className="rounded-full bg-danger-100 px-3 py-1 text-base font-semibold text-danger-800">Renew soon</span>
                      )}
                      <span className="rounded-full bg-brand-100 px-3 py-1 text-base font-semibold text-brand-800">
                        {statusLabel(c.status)}
                      </span>
                    </span>
                  }
                  actions={
                    <BigButton size="md" variant="secondary" onClick={() => setDeleting(c)}>
                      Remove
                    </BigButton>
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      <Modal open={certOpen} title="Add a certificate or licence" onClose={() => setCertOpen(false)}>
        <div className="space-y-4">
          <BigInput label="What is it? (e.g. WAFA safety certificate, Driver licence class C)" required value={cName} onChange={(e) => setCName(e.target.value)} />
          <BigInput label="Issued by (optional)" value={cIssuer} onChange={(e) => setCIssuer(e.target.value)} />
          <BigInput label="Expiry date (leave empty if it never expires)" type="date" value={cExpiry} onChange={(e) => setCExpiry(e.target.value)} />
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setCertOpen(false)}>
              Cancel
            </BigButton>
            <BigButton disabled={busy || cName.trim().length < 3} onClick={() => void addCert()}>
              {busy ? "Saving…" : "Save certificate"}
            </BigButton>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Remove this certificate?"
        message={`“${deleting?.name ?? ""}” will be removed from your record. You can add it again later.`}
        confirmWord="REMOVE"
        onConfirm={() => deleting && void deleteCert(deleting)}
        onCancel={() => setDeleting(null)}
      />

      {/* Documents addressed to me */}
      <section className="mt-10">
        <h2 className="text-lg font-bold text-brand-950">My documents</h2>
        <p className="mt-1 text-base text-ink-soft">Letters and files the office has put in your name — your contract, notices, certificates.</p>
        {(myDocs ?? []).length === 0 ? (
          <p className="mt-3 text-base text-ink-soft">Nothing has been filed under your name yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {(myDocs ?? []).map((d) => (
              <RowCard
                key={d.id}
                title={d.title}
                subtitle={`${statusLabel(d.doc_type)} · filed ${new Date(d.created_at).toLocaleDateString()}`}
                actions={
                  <BigButton size="md" variant="secondary" disabled={!d.file_path} onClick={() => void openDoc(d.file_path, d.storage_bucket)}>
                    Open file
                  </BigButton>
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* Help & policies */}
      <section className="mt-10">
        <h2 className="text-lg font-bold text-brand-950">Help & policies</h2>
        <Card className="mt-3 p-5 space-y-4">
          <div>
            <h3 className="text-base font-bold text-brand-950">Why do you ask for my location when I clock in?</h3>
            <p className="mt-1 text-base text-ink-soft">
              Only the coordinates of the clock moment are stored, next to that record, so your supervisor can confirm you reached the site. We do not
              track you between clock-ins. If you decline the location request, the clock-in is still recorded — marked “location unchecked”.
            </p>
          </div>
          <div>
            <h3 className="text-base font-bold text-brand-950">I clocked in but the time is wrong</h3>
            <p className="mt-1 text-base text-ink-soft">
              Open <strong>My Time</strong> and press <strong>Request a correction</strong>. Fill the three short steps and send it. Your supervisor
              answers, and the fixed time appears on your timesheet.
            </p>
          </div>
          <div>
            <h3 className="text-base font-bold text-brand-950">Who do I call?</h3>
            <p className="mt-1 text-base text-ink-soft">
              Your supervisor first. For pay, leave or bank questions call HR. The office line and the Abuloma address are on your contract — you can
              also ask for them here if they are missing.
            </p>
          </div>
        </Card>
      </section>
    </div>
  );
}
