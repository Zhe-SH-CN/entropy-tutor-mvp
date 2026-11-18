import Link from "next/link";
import { ArrowRight, BookOpenCheck, Network, ShieldCheck, Sparkles, UsersRound } from "lucide-react";

export default function Home() {
  return (
    <main className="landing">
      <header className="landing-nav">
        <div className="brand"><span className="brand-mark"><Network size={22} /></span><span><strong>熵曦</strong><small>AI 家教交付网络</small></span></div>
        <span className="demo-badge">MVP · 全合成数据</span>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">精选大学生教师 × AI 辅助标准化交付</p>
          <h1>让一次匹配，<br /><em>真正走到第四课。</em></h1>
          <p className="hero-lede">比家教黄页更重：管筛选、见面、记课和履约。比传统机构更轻：不建门店，不让 AI 替代真人教师。</p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/parent">从家长需求开始 <ArrowRight size={17} /></Link>
            <Link className="button button-secondary" href="/teacher">进入教师工作台</Link>
            <Link className="button button-secondary" href="/server-demo">真实全栈 Demo</Link>
          </div>
          <p className="microcopy">首发范围：初中数学 · 线上及闵行周边 · 100–200 元/小时</p>
        </div>
        <div className="hero-panel" aria-label="演示流程概览">
          <div className="hero-panel-head"><span>本周交付观察</span><span className="live-dot">可点击演示</span></div>
          <div className="hero-metric"><strong>40P</strong><span>家长目标适配</span><small>先看学生要什么</small></div>
          <div className="hero-metric"><strong>20E</strong><span>教师接单收益</span><small>报价与目标毛时薪比较</small></div>
          <div className="hero-metric"><strong>20R · 20C</strong><span>可靠性与持续上课</span><small>只使用教师确认后的事实</small></div>
          <div className="hero-formula">− 10B − 10L² <b>＋ X</b></div>
          <div className="hero-panel-foot"><ShieldCheck size={17} /> 通勤与备课只扣一次，有效时薪单独展示</div>
        </div>
      </section>
      <section className="principles">
        <article><UsersRound size={22} /><h2>双向选择</h2><p>家长看适配，教师看具体时段与预计有效时薪，不做单向派单。</p></article>
        <article><Sparkles size={22} /><h2>AI 有边界</h2><p>备课、出题、学习状态和家长报告均先形成草稿，必须由教师审核。</p></article>
        <article><BookOpenCheck size={22} /><h2>证据闭环</h2><p>到课、取消、报告与持续上课形成新证据，再反哺下一课与推荐。</p></article>
      </section>
      <section className="role-entry">
        <Link href="/parent"><span>01</span><strong>家长端</strong><p>发布需求 → Top 3 → 见面 → 沙箱首课 → 已确认报告</p><ArrowRight /></Link>
        <Link href="/teacher"><span>02</span><strong>教师工作台</strong><p>邀请响应 → AI 备课与出题 → 记课 → 学习状态复核</p><ArrowRight /></Link>
        <Link href="/ops"><span>03</span><strong>运营控制台</strong><p>漏斗、事件、异常、人工改派与规则解释</p><ArrowRight /></Link>
      </section>
    </main>
  );
}
