import type { TimeSlot } from "@mvp/shared";

const days = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export const minuteLabel = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

export const slotLabel = (slot: TimeSlot): string =>
  `${days[slot.day]} ${minuteLabel(slot.startMinute)}–${minuteLabel(slot.endMinute)}`;

export const moneyLabel = (fen: number): string => `¥${(fen / 100).toFixed(0)}`;

export const dateTimeLabel = (iso: string): string =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

export const modeLabel = (mode: "online" | "offline"): string =>
  mode === "online" ? "线上" : "线下";
