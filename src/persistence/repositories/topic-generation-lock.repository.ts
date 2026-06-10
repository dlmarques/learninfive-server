import type { TopicGenerationLockOptions } from "../../domain/topic-generation-lock";

export interface TopicGenerationLockRepository {
  acquire(
    options: TopicGenerationLockOptions & {
      lockId: string;
      ownerId: string;
    }
  ): Promise<boolean>;
  release(lockId: string, ownerId: string): Promise<void>;
}
