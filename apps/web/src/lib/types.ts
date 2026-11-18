import type { Demand, RecommendationResult, Teacher, TimeSlot } from "@mvp/shared";

export type DemoTeacher = Teacher & {
  school: string;
  education: string;
  bio: string;
  accent: string;
};

export type AIKind = "prep" | "quiz" | "report" | "learning_state";
export type DraftStatus = "empty" | "draft" | "confirmed";
export type LearningStatus = "unverified" | "teacher_confirmed" | "needs_recheck" | "resolved";

export interface AIDraft {
  kind: AIKind;
  status: DraftStatus;
  content: string;
  provider: "Mock";
  version: number;
}

export interface DemoEvent {
  id: string;
  name: string;
  actorRole: "parent" | "teacher" | "ops" | "system";
  entityId: string;
  occurredAt: string;
  detail: string;
}

export interface LessonNote {
  id: string;
  objective: string;
  evidence: string;
  nextPlan: string;
  confirmedAt: string;
}

export interface DemoState {
  schemaVersion: 1;
  demand: Demand;
  recommendation: RecommendationResult;
  invitations: Record<string, "invited" | "accepted" | "declined">;
  meetings: Record<string, "scheduled" | "completed">;
  selectedTeacherId: string | null;
  orderStatus: "none" | "paid_sandbox";
  availabilityOverrides: Record<string, TimeSlot[]>;
  lessonNotes: LessonNote[];
  drafts: Record<AIKind, AIDraft>;
  learningStatus: LearningStatus;
  events: DemoEvent[];
  exceptionQueue: string[];
  lastAction: string;
}

export const EMPTY_DRAFTS: Record<AIKind, AIDraft> = {
  prep: { kind: "prep", status: "empty", content: "", provider: "Mock", version: 1 },
  quiz: { kind: "quiz", status: "empty", content: "", provider: "Mock", version: 1 },
  report: { kind: "report", status: "empty", content: "", provider: "Mock", version: 1 },
  learning_state: { kind: "learning_state", status: "empty", content: "", provider: "Mock", version: 1 },
};
