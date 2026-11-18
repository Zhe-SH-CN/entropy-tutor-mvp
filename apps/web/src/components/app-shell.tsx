"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useDemo } from "./demo-provider";

export function AppShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { state, resetDemo } = useDemo();
  const navigation = [
    { href: "/parent", label: "家长端" },
    { href: "/teacher", label: "教师工作台" },
    { href: "/ops", label: "运营控制台" },
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="返回演示首页">
          <span className="brand-mark"><GraduationCap size={22} strokeWidth={1.8} /></span>
          <span><strong>熵曦</strong><small>AI 家教交付网络</small></span>
        </Link>
        <nav className="main-nav" aria-label="演示角色">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className={pathname === item.href ? "active" : ""} aria-current={pathname === item.href ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="topbar-actions">
          <span className="demo-badge">合成数据 Demo</span>
          <button className="icon-button" type="button" onClick={resetDemo} title="重置全部本地演示数据" aria-label="重置全部本地演示数据">
            <RotateCcw size={17} />
          </button>
        </div>
      </header>
      <main className="workspace">
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="lede">{description}</p>
          </div>
          <div className="rule-chip"><span>规则版本</span><strong>rule_v0.2</strong></div>
        </div>
        <div className="action-notice" role="status" aria-live="polite">{state.lastAction}</div>
        {children}
      </main>
      <footer className="footer">全部人物、需求与课程均为虚构。阶段 A 数据仅存于当前浏览器；沙箱支付不代表真实扣款。</footer>
    </div>
  );
}
