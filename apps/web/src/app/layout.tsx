import type { Metadata } from "next";
import { DemoProvider } from "@/components/demo-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "熵曦 · AI 原生家教平台 Demo",
  description: "精选大学生教师、可解释双向匹配与教师审核的 AI 教学闭环。全部数据为合成演示。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <DemoProvider>{children}</DemoProvider>
      </body>
    </html>
  );
}
