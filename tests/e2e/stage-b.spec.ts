import { test, expect } from "@playwright/test";

async function login(page: import("@playwright/test").Page, role: "家长" | "教师" | "运营") {
  await page.getByRole("button", { name: `${role}登录` }).click();
  await expect(page.getByRole("button", { name: "退出当前角色" })).toBeVisible();
}

async function logout(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "退出当前角色" }).click();
  await expect(page.getByRole("button", { name: "家长登录" })).toBeVisible();
}

test("B-E2E-01 三角色通过真实 API 完成首课、审核报告与审计", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/server-demo");
  await login(page, "家长");
  await page.getByRole("button", { name: "生成真实 Top 3" }).click();
  await page.getByRole("button", { name: "邀请林老师" }).click();
  await logout(page);

  await login(page, "教师");
  await page.getByRole("button", { name: "接受邀请" }).click();
  await logout(page);

  await login(page, "家长");
  await page.getByRole("button", { name: "预约沙箱见面" }).click();
  await logout(page);

  await login(page, "教师");
  await page.getByRole("button", { name: "确认见面完成" }).click();
  await logout(page);

  await login(page, "家长");
  await page.getByRole("button", { name: "家长确认继续" }).click();
  await page.getByRole("button", { name: "创建幂等沙箱订单" }).click();
  await logout(page);

  await login(page, "教师");
  await page.getByRole("button", { name: /记录第 1 课/ }).click();
  await logout(page);

  await login(page, "家长");
  await page.getByRole("button", { name: "确认课次完成" }).click();
  await logout(page);

  await login(page, "教师");
  await page.getByRole("button", { name: "生成报告 Mock 草稿" }).click();
  await page.getByLabel("教师审核后的报告").fill("教师已复核：学生独立完成一道变式题；下一课更换情境再次检查，不自动宣称掌握率。");
  await page.getByRole("button", { name: "确认并发布给家长" }).click();
  await logout(page);

  await login(page, "家长");
  await expect(page.getByText(/教师已复核：学生独立完成一道变式题/)).toBeVisible();
  await logout(page);

  await login(page, "运营");
  await expect(page.getByText("lesson_completion_confirmed", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("lesson_report_confirmed", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("B-E2E-02 恶意 BYOK 地址被拒绝且密钥不进入本地存储", async ({ page }) => {
  await page.goto("/server-demo");
  await login(page, "教师");
  await page.getByLabel("OpenAI 兼容 Base URL").fill("https://127.0.0.1/v1");
  await page.getByLabel("Model", { exact: true }).fill("demo-model");
  await page.getByLabel("API Key", { exact: true }).fill("never-store-this-key");
  await page.getByRole("button", { name: "加密保存 BYOK" }).click();
  await expect(page.locator("p[role='alert']")).toContainText("禁止访问");
  const stored = await page.evaluate(() => JSON.stringify(window.localStorage));
  expect(stored).not.toContain("never-store-this-key");
  await expect(page.getByLabel("API Key", { exact: true })).toHaveValue("");
});

test("D-E2E-01 需求确认、拒单、备课、反馈、教师审核与改派均可从界面完成", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/server-demo");
  await login(page, "家长");
  await page.getByText("创建一条新的合成需求", { exact: true }).click();
  await page.getByLabel("家长原始描述").fill("合成家庭：初二数学，先见面，时间不匹配时允许教师拒单。");
  await page.getByRole("button", { name: "创建、结构化并确认需求" }).click();
  await expect(page.getByRole("status")).toContainText("新需求已完成");
  await page.getByRole("button", { name: "生成真实 Top 3" }).click();
  const exposureResponse = page.waitForResponse((response) => response.url().includes("/api/v1/recommendations/") && response.url().endsWith("/exposures") && response.status() === 201);
  await page.locator(".candidate-card").first().scrollIntoViewIfNeeded();
  await exposureResponse;
  await page.getByRole("button", { name: "邀请林老师" }).click();
  await logout(page);

  await login(page, "教师");
  await page.getByRole("button", { name: "拒绝邀请" }).click();
  await expect(page.getByText("declined", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "生成关系备课卡" }).click();
  await page.getByLabel("教师审核后的备课卡").fill("教师确认的备课卡：先无提示回忆，再使用跨情境题复验，不自动宣称掌握。");
  await page.getByRole("button", { name: "确认备课卡" }).click();
  await page.getByRole("button", { name: "生成学习状态草稿" }).click();
  await page.getByLabel("教师审核后的学习状态").fill("教师确认：能独立完成同情境题，跨情境迁移仍需下一课复验。");
  await page.getByRole("button", { name: "教师确认学习状态" }).click();
  await logout(page);

  await login(page, "家长");
  await page.getByRole("button", { name: "标记报告已读" }).click();
  await page.getByRole("button", { name: "满意并继续" }).click();
  await page.getByRole("button", { name: "换老师并生成新需求" }).click();
  await expect(page.getByRole("status")).toContainText("已生成关联原需求的新草稿");
  await logout(page);

  await login(page, "运营");
  await page.getByRole("button", { name: "审核通过" }).click();
  await expect(page.getByRole("status")).toContainText("已审核通过");
  await page.getByRole("button", { name: "提交人工改派" }).click();
  await expect(page.getByRole("status")).toContainText("原推荐结果未修改");
  await page.getByRole("button", { name: "记录评审通过" }).click();
  await expect(page.getByRole("status")).toContainText("AI 质量评审已追加事件");
  for (const eventName of ["candidate_exposed", "candidate_selected", "prep_card_confirmed", "next_lesson_plan_accepted", "learning_state_confirmed", "parent_feedback_submitted", "teacher_review_completed", "manual_match_overridden", "ai_output_reviewed"]) {
    await expect(page.getByText(eventName, { exact: true }).first()).toBeVisible();
  }
  await page.screenshot({ path: "docs/screenshots/ops-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: "docs/screenshots/ops-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});
