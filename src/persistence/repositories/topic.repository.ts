import type { InsertTopicResult, Topic } from "../../domain/topic";

export interface TopicRepository {
  findPublicTopicByDayKey(dayKey: string): Promise<Topic | null>;
  findUserTopicByDayKey(userId: string, dayKey: string): Promise<Topic | null>;
  findById(topicId: string): Promise<Topic | null>;
  findPublicById(topicId: string): Promise<Topic | null>;
  findUserTopicById(topicId: string, userId: string): Promise<Topic | null>;
  findPreviousPublicTopicConcepts(): Promise<string[]>;
  insertTopicOrReturnExisting(
    topic: Topic,
    findExistingTopic: () => Promise<Topic | null>
  ): Promise<InsertTopicResult>;
}
