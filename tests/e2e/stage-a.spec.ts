import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("A-01 家长、教师、运营完成邀请见面、沙箱首课和已确认报告", async ({ page }) => {
  await page.goto("/parent");
  await expect(page.getByRole("heading", { name: "Top 3 候选" })).toBeVisible();
  const linCard = page.locator(".teacher-card").filter({ hasText: "林老师" });
  await expect(linCard).toBeVisible();
  await linCard.getByRole("button", { name: "发送邀请" }).click();
  await expect(linCard.getByRole("button", { name: "等待教师响应" })).toBeDisabled();

  await page.goto("/teacher");
  await page.getByRole("button", { name: "接受邀请" }).click();
  await expect(page.getByText("已接受，等待家长预约见面")).toBeVisible();

  await page.goto("/parent");
  await page.getByRole("button", { name: /确认免费 15 分钟见面/ }).click();
  await expect(page.getByText("见面已预约，等待教师完成")).toBeVisible();

  await page.goto("/teacher");
  await page.getByRole("button", { name: /完成 15 分钟见面/ }).click();
  await expect(page.getByText("见面已完成", { exact: true })).toBeVisible();

  await page.goto("/parent");
  await page.getByRole("button", { name: /沙箱支付并预约首课/ }).click();
  await expect(page.getByText("沙箱首课已支付", { exact: true })).toBeVisible();

  await page.goto("/teacher");
  await page.getByRole("tab", { name: "记课与 AI 备课" }).click();
  await page.getByRole("button", { name: "确认课次" }).click();
  await expect(page.getByText("课次已确认，请生成并审核家长报告")).toBeVisible();
  await page.getByRole("tab", { name: "家长报告", exact: true }).click();
  await page.getByRole("button", { name: "生成家长报告 Mock 草稿" }).click();
  await expect(page.getByLabel("AI 草稿内容（可编辑，修改后需重新确认）")).toBeVisible();
  await page.getByRole("button", { name: "教师审核并确认" }).click();
  await expect(page.getByText("已确认", { exact: true }).first()).toBeVisible();

  await page.goto("/parent");
  await page.getByRole("tab", { name: "课程与家长报告" }).click();
  await expect(page.getByText(/本课围绕一次函数图象与参数变化展开/)).toBeVisible();

  await page.goto("/ops");
  await page.getByRole("tab", { name: "事件审计" }).click();
  await expect(page.getByText("PaymentOrderPaid", { exact: false })).toBeVisible();
  await expect(page.getByText("ArtifactConfirmed", { exact: false }).first()).toBeVisible();
});

test("A-02 无合格教师时展示诊断，不伪造 Top 3", async ({ page }) => {
  await page.goto("/parent");
  await page.getByRole("button", { name: "调整需求" }).click();
  await page.getByLabel("科目").fill("初中物理");
  await page.getByRole("button", { name: "确认需求并重算 Top 3" }).click();
  await expect(page.getByText("没有伪造的推荐结果")).toBeVisible();
  await expect(page.locator(".empty-state").getByText(/当前没有满足全部硬约束的教师/)).toBeVisible();
});

test("A-03 需求中的 HTML 输入只作为文本渲染", async ({ page }) => {
  await page.goto("/parent");
  await page.getByRole("button", { name: "调整需求" }).click();
  const payload = "<img src=x alt=x onerror=window.__demoXss=1>";
  await page.getByLabel("学习目标（逗号分隔）").fill(payload);
  await page.getByRole("button", { name: "确认需求并重算 Top 3" }).click();
  await expect(page.getByText(payload, { exact: true })).toBeVisible();
  await expect(page.locator('img[alt="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__demoXss ?? 0)).toBe(0);
});

test("A-04 移动端没有页面级横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/parent");
  await expect(page.getByRole("heading", { name: "Top 3 候选" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1);
});

test("A-05 BYOK 密钥输入禁用且不进入本地存储", async ({ page }) => {
  await page.goto("/teacher");
  await page.getByRole("tab", { name: "模型与 BYOK" }).click();
  await expect(page.getByLabel("API Key")).toBeDisabled();
  const persisted = await page.evaluate(() => window.localStorage.getItem("entropy-tutor-demo-v1") ?? "");
  expect(persisted).not.toContain("sk-");
  expect(persisted).not.toContain("apiKey");
});

declare global {
  interface Window {
    __demoXss?: number;
  }
}
