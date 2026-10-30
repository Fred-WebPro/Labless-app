"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { browserClient } from "@/lib/browser";

const LINKS = [
  { href: "/", label: "Обзор" },
  { href: "/users", label: "Пользователи" },
  { href: "/reports", label: "Анализы" },
  { href: "/health", label: "Здоровье" },
  { href: "/activity", label: "Активность" },
  { href: "/push", label: "Рассылки" },
];

export function Nav({ email }: { email: string }) {
  const path = usePathname();
  const router = useRouter();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  const signOut = async () => {
    await browserClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <aside className="side">
      <Link href="/" className="brand">
        <span>
          <s>Lab</s>less
        </span>
        <small>admin</small>
      </Link>
      <nav className="nav">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={active(l.href) ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="side__foot">
        <span className="mono">{email}</span>
        <button className="btn" onClick={signOut}>
          Выйти
        </button>
      </div>
    </aside>
  );
}
