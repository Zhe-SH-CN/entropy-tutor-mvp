import { z } from "zod";

export const timeSlotSchema = z.object({
  day: z.number().int().min(1).max(7),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
}).refine((slot) => slot.startMinute < slot.endMinute, {
  message: "结束时间必须晚于开始时间",
});

export const createDemandSchema = z.object({
  subject: z.string().trim().min(1).max(50),
  gradeBand: z.enum(["小学", "初中", "高中"]),
  mode: z.enum(["online", "offline"]),
  areaCode: z.string().trim().min(1).max(30),
  budgetMinFen: z.number().int().positive().max(1_000_000),
  budgetMaxFen: z.number().int().positive().max(1_000_000),
  lessonMinutes: z.number().int().min(30).max(240),
  preferredSlots: z.array(timeSlotSchema).min(1).max(10),
  objectives: z.array(z.string().trim().min(1).max(100)).max(10),
  requiredExperience: z.array(z.string().trim().min(1).max(50)).max(10),
  preferenceTags: z.array(z.string().trim().min(1).max(30)).max(10),
}).refine((demand) => demand.budgetMinFen <= demand.budgetMaxFen, {
  message: "预算下限不能高于上限",
});

export type CreateDemandInput = z.infer<typeof createDemandSchema>;
