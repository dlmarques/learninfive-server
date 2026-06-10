import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { TopicGenerationLock } from "../../domain/topic-generation-lock";
import type { TopicGenerationLockRepository } from "../repositories/topic-generation-lock.repository";
import { isDuplicateKeyError } from "./mongo-errors";
import { MongoDatabaseService } from "./mongo-database.service";

@Injectable()
export class MongoTopicGenerationLockRepository
  implements TopicGenerationLockRepository
{
  private readonly lockTtlMs: number;

  constructor(
    private readonly databaseService: MongoDatabaseService,
    configService: ConfigService
  ) {
    this.lockTtlMs =
      configService.get<number>("TOPIC_GENERATION_LOCK_TTL_MS") ??
      2 * 60 * 1000;
  }

  async acquire({
    lockId,
    ownerId,
    scope,
    userId,
    dayKey,
  }: {
    lockId: string;
    ownerId: string;
    scope: TopicGenerationLock["scope"];
    userId?: string;
    dayKey: string;
  }) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.lockTtlMs);

    try {
      const lock = await this.collection().findOneAndUpdate(
        {
          _id: lockId,
          $or: [{ expiresAt: { $lte: now } }, { ownerId }],
        },
        {
          $set: {
            ownerId,
            scope,
            userId,
            dayKey,
            expiresAt,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        {
          upsert: true,
          returnDocument: "after",
        }
      );

      return lock?.ownerId === ownerId;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return false;
      }

      throw error;
    }
  }

  async release(lockId: string, ownerId: string) {
    await this.collection().deleteOne({ _id: lockId, ownerId });
  }

  private collection() {
    return this.databaseService.getCollection<TopicGenerationLock>(
      "topics",
      "topicGenerationLocks"
    );
  }
}
