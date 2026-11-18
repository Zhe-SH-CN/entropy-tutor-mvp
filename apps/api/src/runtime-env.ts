export function validateRuntimeEnv(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return;
  const required = ["DATABASE_URL", "APP_ORIGIN", "SESSION_SECRET", "BYOK_MASTER_KEY", "PAYMENT_WEBHOOK_SECRET"] as const;
  for (const key of required) {
    const value = env[key]?.trim();
    if (!value || value.includes("replace-with")) throw new Error(`生产环境缺少有效 ${key}`);
  }
  if ((env.SESSION_SECRET?.length ?? 0) < 32) throw new Error("SESSION_SECRET 至少需要 32 个字符");
  if (!/^[a-f0-9]{64}$/i.test(env.BYOK_MASTER_KEY ?? "")) throw new Error("BYOK_MASTER_KEY 必须是 32 字节随机十六进制");
  if ((env.PAYMENT_WEBHOOK_SECRET?.length ?? 0) < 32) throw new Error("PAYMENT_WEBHOOK_SECRET 至少需要 32 个字符");
  for (const origin of (env.APP_ORIGIN ?? "").split(",").map((item) => item.trim()).filter(Boolean)) {
    const url = new URL(origin);
    if (url.protocol === "https:" && env.COOKIE_SECURE !== "true") throw new Error("HTTPS 部署必须设置 COOKIE_SECURE=true");
    if (url.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) throw new Error("公网部署不得使用明文 HTTP APP_ORIGIN");
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("APP_ORIGIN 仅允许 HTTP(S)");
  }
}
