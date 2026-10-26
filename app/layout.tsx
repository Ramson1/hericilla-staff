import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { QueryProvider } from "@/components/QueryProvider";
import { RecoveryRedirect } from "@/components/RecoveryRedirect";

export const metadata: Metadata = {
  title: { template: "%s · Hericilla Staff", default: "Hericilla Staff Portal" },
  description: "My work, my timesheet and my pay — the simple Hericilla staff portal.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <QueryProvider>
            <RecoveryRedirect />
            {children}
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
