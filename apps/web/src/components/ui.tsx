import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function SectionHeading({ eyebrow, title, aside }: { eyebrow?: string; title: string; aside?: ReactNode }) {
  return (
    <div className="section-heading">
      <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>
      {aside}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "info" | "danger" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function ScoreBar({ label, value, negative = false }: { label: string; value: number; negative?: boolean }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="score-bar">
      <div><span>{label}</span><strong className={negative ? "negative" : ""}>{negative ? "−" : ""}{percent}%</strong></div>
      <div className="score-track" aria-hidden="true"><span className={negative ? "negative-track" : ""} style={{ width: `${percent}%` }} /></div>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><strong>{title}</strong><p>{description}</p></div>;
}

export function Stepper({ current }: { current: number }) {
  const steps = ["确认需求", "Top 3 候选", "免费见面", "正式课与报告"];
  return (
    <ol className="stepper" aria-label="家长流程进度">
      {steps.map((step, index) => <li key={step} className={index + 1 <= current ? "done" : ""}><span>{index + 1}</span>{step}</li>)}
    </ol>
  );
}
