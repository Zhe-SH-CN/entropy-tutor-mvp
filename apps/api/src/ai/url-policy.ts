import { BadRequestException } from "@nestjs/common";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0]!;
  if (normalized.startsWith("::ffff:")) return isPrivateAddress(normalized.slice(7));
  if (isIP(normalized) === 6) {
    return normalized === "::" || normalized === "::1" || /^(fc|fd|fe80|fe90|fea0|feb0|ff)/.test(normalized);
  }
  if (isIP(normalized) !== 4) return true;
  const parts = normalized.split(".").map(Number);
  const [a = 0, b = 0] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0);
}

export async function assertPublicHttpsUrl(value: string): Promise<URL> {
  let url: URL;
  try { url = new URL(value); } catch { throw new BadRequestException("Base URL 无效"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new BadRequestException("仅允许无凭据的 HTTPS Base URL");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new BadRequestException("禁止访问本机或内部主机");
  }
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true }).catch(() => {
    throw new BadRequestException("Base URL 主机无法解析");
  });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new BadRequestException("禁止访问私网、环回或链路本地地址");
  }
  return url;
}

export async function secureFetch(urlValue: string, init: RequestInit, redirects = 0): Promise<string> {
  const url = await assertPublicHttpsUrl(urlValue);
  if (redirects > 3) throw new BadRequestException("模型接口重定向过多");
  const response = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(10_000) });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    if (!location) throw new BadRequestException("模型接口重定向缺少 Location");
    return secureFetch(new URL(location, url).toString(), init, redirects + 1);
  }
  if (!response.ok) throw new BadRequestException(`模型接口返回 ${response.status}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 1_000_000) throw new BadRequestException("模型响应过大");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 1_000_000) {
      await reader.cancel();
      throw new BadRequestException("模型响应过大");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
