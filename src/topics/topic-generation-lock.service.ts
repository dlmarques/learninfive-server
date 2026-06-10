import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type {
  TopicGenerationLockOptions,
  TopicGenerationLockScope,
} from "../domain/topic-generation-lock";
import {
  TOPIC_GENERATION_LOCK_REPOSITORY,
} from "../persistence/repositories/repository.tokens";
import type { TopicGenerationLockRepository } from "../persistence/repositories/topic-generation-lock.repository";

export class TopicGenerationInProgressError extends Error {
  constructor() {
    super("Topic in progress");
    this.name = "TopicGenerationInProgressError";
  }
}

@Injectable()
export class TopicGenerationLockService {
  constructor(
    @Inject(TOPIC_GENERATION_LOCK_REPOSITORY)
    private readonly lockRepository: TopicGenerationLockRepository
  ) {}

  buildLockId({
    scope,
    userId,
    dayKey,
  }: {
    scope: TopicGenerationLockScope;
    userId?: string;
    dayKey: string;
  }) {
    if (scope === "public") {
      return `topic-generation:public:${dayKey}`;
    }

    if (!userId) {
      throw new Error("User topic generation locks require a userId");
    }

    return `topic-generation:user:${userId}:${dayKey}`;
  }

  async withLock<T>(
    options: TopicGenerationLockOptions,
    callback: () => Promise<T>
  ) {
    const ownerId = randomUUID();
    const lockId = this.buildLockId(options);
    const acquired = await this.lockRepository.acquire({
      ...options,
      lockId,
      ownerId,
    });

    if (!acquired) {
      throw new TopicGenerationInProgressError();
    }

    try {
      return await callback();
    } finally {
      try {
        await this.lockRepository.release(lockId, ownerId);
      } catch (error) {
        console.error(error);
      }
    }
  }
}
