"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  Home,
  CalendarCheck,
  ClipboardList,
  Briefcase,
  Palmtree,
  Wallet,
  Bell,
  UserRound,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
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

/** Sidebar collapse state, remembered per browser. Read after mount so the
    server-rendered markup always matches the first client render (no hydration drift). */
function useSidebarCollapse(storageKey: string) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(storageKey) === "collapsed");
    } catch {
      /* storage unavailable — stay expanded */
    }
  }, [storageKey]);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(storageKey, next ? "collapsed" : "expanded");
    } catch {
      /* ignore */
    }
  };
  return { collapsed, toggle };
}

export function StaffShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const { collapsed, toggle } = useSidebarCollapse("hericilla-staff-sidebar");
  const unseen = useUnseenCount(profile?.id ?? null, profile?.role ?? null);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="min-h-screen bg-surface lg:flex">
      {/* Sidebar (desktop) — collapsible via the toggle button */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 bg-brand-950 text-white transition-[width] duration-200 ${
          collapsed ? "lg:w-20" : "lg:w-64"
        }`}
      >
        <div className={`flex items-center ${collapsed ? "lg:flex-col lg:gap-1 lg:p-3" : "gap-3 p-5"}`}>
          <Link href="/" className={`flex items-center gap-3 ${collapsed ? "lg:justify-center" : ""}`}>
            <span className="rounded-xl bg-white p-1">
              <Image src="/logo.png" alt="" width={40} height={40} className="block rounded-lg" />
            </span>
            {!collapsed && (
              <span className="text-base font-extrabold leading-tight">
                Hericilla
                <span className="block text-xs font-medium text-brand-200">Staff portal</span>
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`p-2 rounded-lg text-brand-200 hover:bg-brand-900 hover:text-white transition ${
              collapsed ? "lg:self-center" : "ml-auto"
            }`}
          >
            {collapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
          </button>
        </div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              title={collapsed ? n.label : undefined}
              className={`flex items-center rounded-xl py-3 text-base font-semibold transition ${
                collapsed ? "justify-center px-2" : "gap-3 px-4"
              } ${isActive(n.href) ? "bg-white text-brand-950" : "hover:bg-brand-900"}`}
            >
              {n.icon}
              {!collapsed && n.label}
            </Link>
          ))}
        </nav>
        {!collapsed && <div className="p-5 text-sm text-brand-200">Signed in as {profile?.full_name || profile?.email}</div>}
      </aside>

      <div className={`flex-1 pb-24 lg:pb-0 transition-[padding] duration-200 ${collapsed ? "lg:pl-20" : "lg:pl-64"}`}>
        <header className="bg-white border-b border-[var(--color-line)] sticky top-0 z-40">
          <div className="mx-auto max-w-4xl px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              {/* Mobile branding (sidebar is desktop-only) */}
              <div className="lg:hidden flex items-center gap-2 font-extrabold text-brand-950">
                <span className="rounded-lg bg-white p-1 ring-1 ring-[var(--color-line)]">
                  <Image src="/logo.png" alt="" width={32} height={32} className="block rounded" />
                </span>
                Hericilla Staff
              </div>
              {/* Desktop greeting */}
              <div className="hidden lg:block">
                <p className="text-base font-extrabold text-brand-950 leading-tight">Hericilla Staff Portal</p>
                <p className="text-sm text-ink-soft truncate">Hello, {profile?.full_name?.split(" ")[0] ?? "there"}</p>
              </div>
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
              <LogOut className="h-5 w-5" /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      </div>

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
