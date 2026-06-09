export type TopicGenerationLockScope = "public" | "user";

export interface TopicGenerationLock {
  _id: string;
  ownerId: string;
  scope: TopicGenerationLockScope;
  userId?: string;
  dayKey: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
