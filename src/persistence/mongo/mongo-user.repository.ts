import { Injectable } from "@nestjs/common";
import type { WithId } from "mongodb";
import type { Topic } from "../../domain/topic";
import type { User, UserProfileInput } from "../../domain/user";
import { DuplicateEntityError } from "../repositories/persistence.errors";
import type { UserRepository } from "../repositories/user.repository";
import { isDuplicateKeyError } from "./mongo-errors";
import { MongoDatabaseService } from "./mongo-database.service";

type UserDocument = User;

@Injectable()
export class MongoUserRepository implements UserRepository {
  constructor(private readonly databaseService: MongoDatabaseService) {}

  async findByUserId(userId: string) {
    const user = await this.collection().findOne({ userId });
    return toUser(user);
  }

  async exists(userId: string) {
    const user = await this.collection().findOne(
      { userId },
      { projection: { _id: 1 } }
    );

    return Boolean(user?._id);
  }

  async create(user: User) {
    try {
      await this.collection().insertOne(user);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new DuplicateEntityError("User already exists");
      }

      throw error;
    }

    return user;
  }

  async updateProfile(userId: string, profile: UserProfileInput) {
    const result = await this.collection().updateOne(
      { userId },
      {
        $set: {
          userId,
          csLevel: profile.csLevel,
          goals: profile.goals,
          preferences: profile.preferences,
          topicsToAvoid: profile.topicsToAvoid,
        },
      }
    );

    return result.matchedCount > 0;
  }

  async appendPastTopic(userId: string, topic: Topic) {
    const result = await this.collection().updateOne(
      { userId },
      {
        $addToSet: {
          pastTopics: { id: topic.id, concept: topic.concept },
        },
      }
    );

    return result.matchedCount > 0;
  }

  async appendAnsweredQuiz(
    userId: string,
    quizId: string,
    correctness: boolean
  ) {
    const result = await this.collection().updateOne(
      { userId },
      {
        $push: {
          answeredQuizzes: { id: quizId, correctness },
        },
      }
    );

    return result.matchedCount > 0;
  }

  private collection() {
    return this.databaseService.getCollection<UserDocument>("users", "user");
  }
}

const toUser = (document: WithId<UserDocument> | null): User | null => {
  if (!document) {
    return null;
  }

  const { _id, ...user } = document;

  return user;
};
