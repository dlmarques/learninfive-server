import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import type { Document } from "mongodb";
import { getUtcDayKey } from "../../topics/topic-day-key";
import { MongoDatabaseService } from "./mongo-database.service";

interface DuplicateTopicReport {
  topicIds: Document[];
  publicTopics: Document[];
  userTopics: Document[];
}

@Injectable()
export class MongoStorageService implements OnApplicationBootstrap {
  constructor(private readonly databaseService: MongoDatabaseService) {}

  async onApplicationBootstrap() {
    await this.ensureStorage();
  }

  async ensureStorage() {
    await this.backfillTopicDayKeys();
    await this.throwIfDuplicateTopicsExist();
    await this.ensureTopicIndexes();
    await this.ensureTopicGenerationLockIndexes();
    await this.throwIfDuplicateUsersExist();
    await this.ensureUserIndexes();
  }

  async inspectDuplicateTopics() {
    return this.findDuplicateTopics();
  }

  async inspectDuplicateUsers() {
    return this.findDuplicateUsers();
  }

  private getTopicsCollection() {
    return this.databaseService.getCollection("topics", "topic");
  }

  private getLocksCollection() {
    return this.databaseService.getCollection(
      "topics",
      "topicGenerationLocks"
    );
  }

  private getUsersCollection() {
    return this.databaseService.getCollection("users", "user");
  }

  private async backfillTopicDayKeys() {
    const topics = this.getTopicsCollection();
    const cursor = topics.find({
      dayKey: { $exists: false },
      date: { $exists: true },
    });

    for await (const topic of cursor) {
      const date = topic.date instanceof Date ? topic.date : new Date(topic.date);

      if (Number.isNaN(date.getTime())) {
        continue;
      }

      await topics.updateOne(
        { _id: topic._id },
        { $set: { dayKey: getUtcDayKey(date) } }
      );
    }
  }

  private async findDuplicateTopics(): Promise<DuplicateTopicReport> {
    const topics = this.getTopicsCollection();

    const topicIds = await topics
      .aggregate([
        { $match: { id: { $exists: true } } },
        {
          $group: {
            _id: "$id",
            count: { $sum: 1 },
            dayKeys: { $push: "$dayKey" },
            concepts: { $push: "$concept" },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ])
      .toArray();

    const publicTopics = await topics
      .aggregate([
        {
          $match: {
            public: true,
            dayKey: { $exists: true },
          },
        },
        {
          $group: {
            _id: "$dayKey",
            count: { $sum: 1 },
            ids: { $push: "$id" },
            concepts: { $push: "$concept" },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ])
      .toArray();

    const userTopics = await topics
      .aggregate([
        {
          $match: {
            public: false,
            userId: { $exists: true },
            dayKey: { $exists: true },
          },
        },
        {
          $group: {
            _id: {
              dayKey: "$dayKey",
              userId: "$userId",
            },
            count: { $sum: 1 },
            ids: { $push: "$id" },
            concepts: { $push: "$concept" },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ])
      .toArray();

    return {
      topicIds,
      publicTopics,
      userTopics,
    };
  }

  private async throwIfDuplicateTopicsExist() {
    const duplicates = await this.findDuplicateTopics();

    if (
      duplicates.topicIds.length === 0 &&
      duplicates.publicTopics.length === 0 &&
      duplicates.userTopics.length === 0
    ) {
      return;
    }

    throw new Error(
      `Cannot create unique topic indexes while duplicate topics exist: ${JSON.stringify(
        duplicates
      )}`
    );
  }

  private async ensureTopicIndexes() {
    const topics = this.getTopicsCollection();

    await topics.createIndex(
      { id: 1 },
      {
        name: "uniq_topic_id",
        unique: true,
        partialFilterExpression: {
          id: { $exists: true },
        },
      }
    );

    await topics.createIndex(
      { dayKey: 1 },
      {
        name: "uniq_public_topic_day",
        unique: true,
        partialFilterExpression: {
          public: true,
          dayKey: { $exists: true },
        },
      }
    );

    await topics.createIndex(
      { dayKey: 1, userId: 1 },
      {
        name: "uniq_user_topic_day",
        unique: true,
        partialFilterExpression: {
          public: false,
          userId: { $exists: true },
          dayKey: { $exists: true },
        },
      }
    );
  }

  private async ensureTopicGenerationLockIndexes() {
    const locks = this.getLocksCollection();

    await locks.createIndex(
      { expiresAt: 1 },
      {
        name: "ttl_topic_generation_locks_expires_at",
        expireAfterSeconds: 0,
      }
    );
  }

  private async findDuplicateUsers(): Promise<Document[]> {
    const users = this.getUsersCollection();

    return users
      .aggregate([
        { $match: { userId: { $exists: true } } },
        {
          $group: {
            _id: "$userId",
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ])
      .toArray();
  }

  private async throwIfDuplicateUsersExist() {
    const duplicates = await this.findDuplicateUsers();

    if (duplicates.length === 0) {
      return;
    }

    throw new Error(
      `Cannot create unique user indexes while duplicate users exist: ${JSON.stringify(
        duplicates
      )}`
    );
  }

  private async ensureUserIndexes() {
    const users = this.getUsersCollection();

    await users.createIndex(
      { userId: 1 },
      {
        name: "uniq_user_userId",
        unique: true,
        partialFilterExpression: {
          userId: { $exists: true },
        },
      }
    );
  }
}
