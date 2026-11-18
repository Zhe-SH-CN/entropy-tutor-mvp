-- DropIndex
DROP INDEX "Lesson_relationshipId_sequence_key";

-- AlterTable
ALTER TABLE "Artifact" ADD COLUMN "editedBy" TEXT,
ADD COLUMN "promptVersion" TEXT NOT NULL DEFAULT 'prompt_v0.2',
ADD COLUMN "rawContent" TEXT NOT NULL DEFAULT '',
ADD COLUMN "relationshipId" TEXT,
ADD COLUMN "viewedAt" TIMESTAMP(3),
ALTER COLUMN "lessonId" DROP NOT NULL;

ALTER TABLE "Demand" ADD COLUMN "confirmedAt" TIMESTAMP(3),
ADD COLUMN "previousDemandId" TEXT,
ADD COLUMN "rawText" TEXT NOT NULL DEFAULT '',
ADD COLUMN "structuredPayload" JSONB,
ALTER COLUMN "status" SET DEFAULT 'draft';

ALTER TABLE "EventLog" ADD COLUMN "actorType" TEXT NOT NULL DEFAULT 'user',
ADD COLUMN "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "schemaVersion" TEXT NOT NULL DEFAULT 'v0.2',
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'server';

ALTER TABLE "Invitation" ADD COLUMN "declineReason" TEXT,
ADD COLUMN "expiresAt" TIMESTAMP(3);

ALTER TABLE "Lesson" ADD COLUMN "cancelReason" TEXT,
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "completionMarkedAt" TIMESTAMP(3),
ADD COLUMN "confirmedBy" TEXT,
ADD COLUMN "scheduleKey" TEXT,
ADD COLUMN "scheduledAt" TIMESTAMP(3),
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'completion_marked';

ALTER TABLE "Meeting" ADD COLUMN "cancelReason" TEXT,
ADD COLUMN "noShowParty" TEXT,
ADD COLUMN "parentOutcome" TEXT,
ADD COLUMN "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "teacherOutcome" TEXT;

ALTER TABLE "PaymentOrder" ADD COLUMN "lessonCount" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Teacher" ADD COLUMN "availabilityUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "credentials" JSONB,
ADD COLUMN "reviewNote" TEXT,
ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'approved',
ADD COLUMN "reviewedBy" TEXT;

CREATE TABLE "LearningState" (
    "id" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "lessonId" TEXT,
    "artifactId" TEXT,
    "knowledgeTag" TEXT NOT NULL,
    "currentClaim" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL DEFAULT 'unverified',
    "evidence" TEXT NOT NULL,
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ParentFeedback" (
    "id" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "lessonId" TEXT,
    "parentId" TEXT NOT NULL,
    "continueIntent" TEXT NOT NULL,
    "reasonCodes" JSONB NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ParentFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManualOverride" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "fromTeacherId" TEXT,
    "toTeacherId" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reasonText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManualOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearningState_artifactId_key" ON "LearningState"("artifactId");
CREATE UNIQUE INDEX "Lesson_scheduleKey_key" ON "Lesson"("scheduleKey");
CREATE INDEX "Lesson_relationshipId_sequence_idx" ON "Lesson"("relationshipId", "sequence");

ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningState" ADD CONSTRAINT "LearningState_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParentFeedback" ADD CONSTRAINT "ParentFeedback_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParentFeedback" ADD CONSTRAINT "ParentFeedback_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParentFeedback" ADD CONSTRAINT "ParentFeedback_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManualOverride" ADD CONSTRAINT "ManualOverride_runId_fkey" FOREIGN KEY ("runId") REFERENCES "RecommendationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManualOverride" ADD CONSTRAINT "ManualOverride_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
