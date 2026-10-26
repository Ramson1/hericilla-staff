"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Home, CalendarCheck, ClipboardList, Briefcase, Palmtree, Wallet, Bell, UserRound, LogOut } from "lucide-react";
import { useUnseenCount } from "@hericilla/push-web";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/", label: "Home", icon: <Home className="h-6 w-6" /> },
  { href: "/attendance", label: "My Time", icon: <CalendarCheck className="h-6 w-6" /> },
  { href: "/tasks", label: "My Tasks", icon: <ClipboardList className="h-6 w-6" /> },
  { href: "/workspace", label: "My Work", icon: <Briefcase className="h-6 w-6" /> },
  { href: "/leave", label: "Leave", icon: <Palmtree className="h-6 w-6" /> },
  { href: "/payslips", label: "My Pay", icon: <Wallet className="h-6 w-6" /> },
  { href: "/profile", label: "Profile", icon: <UserRound className="h-6 w-6" /> },
];

export function StaffShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const unseen = useUnseenCount(profile?.id ?? null, profile?.role ?? null);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="min-h-screen bg-surface pb-24 lg:pb-8">
      <header className="bg-white border-b border-[var(--color-line)]">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center gap-3">
          <Image src="/logo.png" alt="" width={44} height={44} className="rounded-xl" />
          <div className="flex-1 min-w-0">
            <p className="text-lg font-extrabold text-brand-950 leading-tight">Hericilla Staff</p>
            <p className="text-base text-ink-soft truncate">Hello, {profile?.full_name?.split(" ")[0] ?? "there"}</p>
          </div>
          <Link
            href="/notifications"
            className="relative p-2.5 rounded-full hover:bg-brand-50 text-ink-soft"
            aria-label={unseen > 0 ? `Alerts — ${unseen} unread` : "Alerts"}
          >
            <Bell className="h-6 w-6" />
            {unseen > 0 && (
              <span className="absolute -top-1 -right-1 min-w-6 h-6 px-1 rounded-full bg-danger-600 text-white text-sm font-bold flex items-center justify-center">
                {unseen > 99 ? "99+" : unseen}
              </span>
            )}
          </Link>
          <button
            onClick={() => void signOut()}
            className="inline-flex items-center gap-2 rounded-[var(--radius-btn)] border border-[var(--color-line)] px-4 py-2 text-base font-bold text-ink-soft hover:bg-brand-50"
          >
            <LogOut className="h-5 w-5" /> Sign out
          </button>
        </div>
        {/* Desktop nav */}
        <nav className="mx-auto max-w-4xl px-4 pb-3 hidden lg:flex gap-2 flex-wrap" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`inline-flex items-center gap-2 rounded-[var(--radius-btn)] px-4 py-3 text-base font-bold ${
                isActive(n.href) ? "bg-brand-700 text-white" : "bg-brand-50 text-brand-900 hover:bg-brand-100"
              }`}
            >
              {n.icon}
              {n.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>

      {/* Bottom nav (mobile) */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[var(--color-line)] flex"
        aria-label="Main"
      >
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold ${
              isActive(n.href) ? "text-brand-700" : "text-ink-soft"
            }`}
          >
            {n.icon}
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
