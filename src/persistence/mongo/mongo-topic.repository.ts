import { Injectable } from "@nestjs/common";
import type { WithId } from "mongodb";
import type { InsertTopicResult, Topic } from "../../domain/topic";
import type { TopicRepository } from "../repositories/topic.repository";
import { isDuplicateKeyError } from "./mongo-errors";
import { MongoDatabaseService } from "./mongo-database.service";

type TopicDocument = Topic;

@Injectable()
export class MongoTopicRepository implements TopicRepository {
  constructor(private readonly databaseService: MongoDatabaseService) {}

  async findPublicTopicByDayKey(dayKey: string) {
    const topic = await this.collection().findOne({ public: true, dayKey });
    return toTopic(topic);
  }

  async findUserTopicByDayKey(userId: string, dayKey: string) {
    const topic = await this.collection().findOne({
      public: false,
      userId,
      dayKey,
    });
    return toTopic(topic);
  }

  async findById(topicId: string) {
    const topic = await this.collection().findOne({ id: topicId });
    return toTopic(topic);
  }

  async findPublicById(topicId: string) {
    const topic = await this.collection().findOne({
      id: topicId,
      public: true,
    });
    return toTopic(topic);
  }

  async findUserTopicById(topicId: string, userId: string) {
    const topic = await this.collection().findOne({
      id: topicId,
      public: false,
      userId,
    });
    return toTopic(topic);
  }

  async findPreviousPublicTopicConcepts() {
    const topics = await this.collection().find({ public: true }).toArray();

    return topics.map((topic) => topic.concept);
  }

  async insertTopicOrReturnExisting(
    newTopic: Topic,
    findExistingTopic: () => Promise<Topic | null>
  ): Promise<InsertTopicResult> {
    try {
      await this.collection().insertOne(newTopic);

      return { inserted: true, topic: newTopic };
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const existingTopic = await findExistingTopic();

      if (!existingTopic) {
        throw error;
      }

      return { inserted: false, topic: existingTopic };
    }
  }

  private collection() {
    return this.databaseService.getCollection<TopicDocument>("topics", "topic");
  }
}

const toTopic = (document: WithId<TopicDocument> | null): Topic | null => {
  if (!document) {
    return null;
  }

  const { _id, ...topic } = document;

  return topic;
};
