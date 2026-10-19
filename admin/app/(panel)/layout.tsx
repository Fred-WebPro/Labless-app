import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="shell">
      <Nav email={admin.email} />
      <main className="main">{children}</main>
    </div>
  );
}
