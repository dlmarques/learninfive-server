import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { AiTopicService } from "../ai/ai-topic.service";
import { parseModelTopicResponse } from "../ai/model-topic-parser";
import type { UserDataToModel } from "../domain/model";
import type { Topic } from "../domain/topic";
import type { User } from "../domain/user";
import {
  TOPIC_REPOSITORY,
  USER_REPOSITORY,
} from "../persistence/repositories/repository.tokens";
import type { TopicRepository } from "../persistence/repositories/topic.repository";
import type { UserRepository } from "../persistence/repositories/user.repository";
import { getUtcDayKey } from "./topic-day-key";
import {
  TopicGenerationInProgressError,
  TopicGenerationLockService,
} from "./topic-generation-lock.service";

@Injectable()
export class TopicsService {
  constructor(
    @Inject(TOPIC_REPOSITORY)
    private readonly topicRepository: TopicRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly aiTopicService: AiTopicService,
    private readonly lockService: TopicGenerationLockService
  ) {}

  async getPublicTopicForToday() {
    try {
      return await this.getOrCreatePublicTopicForDay();
    } catch (error) {
      if (error instanceof TopicGenerationInProgressError) {
        throw topicGenerationInProgressException();
      }

      throw error;
    }
  }

  async getUserTopicForToday(userId: string) {
    try {
      const dayKey = getUtcDayKey();
      const user = await this.userRepository.findByUserId(userId);

      if (!user) {
        throw new NotFoundException({
          message: "User not found",
          code: "USER_NOT_FOUND",
        });
      }

      const existingTopic = await this.topicRepository.findUserTopicByDayKey(
        userId,
        dayKey
      );

      if (existingTopic) {
        return this.attachUserAnswer(existingTopic, user);
      }

      return this.getOrCreateUserTopicForDay(
        {
          pastTopics: extractPastTopics(user),
          csLevel: user.csLevel,
          preferences: user.preferences,
          topicsToAvoid: user.topicsToAvoid,
          goals: user.goals,
        },
        userId,
        dayKey
      );
    } catch (error) {
      if (error instanceof TopicGenerationInProgressError) {
        throw topicGenerationInProgressException();
      }

      throw error;
    }
  }

  async answerQuiz(topicId: string, answerId: string, userId?: string) {
    const topic = userId
      ? await this.topicRepository.findUserTopicById(topicId, userId)
      : await this.topicRepository.findPublicById(topicId);

    if (!topic) {
      throw new NotFoundException({
        message: "Topic not found",
        code: "TOPIC_NOT_FOUND",
      });
    }

    const correct = topic.quiz.rightAnswer === answerId;

    if (userId) {
      const updated = await this.userRepository.appendAnsweredQuiz(
        userId,
        topic.quiz.id,
        correct
      );

      if (!updated) {
        throw new InternalServerErrorException({
          message: "Could not persist quiz answer",
          code: "QUIZ_ANSWER_NOT_PERSISTED",
        });
      }
    }

    return { correct };
  }

  async getOrCreatePublicTopicForDay(dayKey = getUtcDayKey()) {
    const existingTopic = await this.topicRepository.findPublicTopicByDayKey(
      dayKey
    );

    if (existingTopic) {
      return existingTopic;
    }

    return this.lockService.withLock(
      {
        scope: "public",
        dayKey,
      },
      async () => {
        const existingTopicAfterLock =
          await this.topicRepository.findPublicTopicByDayKey(dayKey);

        if (existingTopicAfterLock) {
          return existingTopicAfterLock;
        }

        return this.createPublicTopic(dayKey);
      }
    );
  }

  async getOrCreateUserTopicForDay(
    userDataToModel: UserDataToModel,
    userId: string,
    dayKey = getUtcDayKey()
  ) {
    const existingTopic = await this.topicRepository.findUserTopicByDayKey(
      userId,
      dayKey
    );

    if (existingTopic) {
      return existingTopic;
    }

    return this.lockService.withLock(
      {
        scope: "user",
        userId,
        dayKey,
      },
      async () => {
        const existingTopicAfterLock =
          await this.topicRepository.findUserTopicByDayKey(userId, dayKey);

        if (existingTopicAfterLock) {
          return existingTopicAfterLock;
        }

        return this.createUserTopic(userDataToModel, userId, dayKey);
      }
    );
  }

  requestAndSaveNewPublicTopic() {
    return this.getOrCreatePublicTopicForDay();
  }

  private async createPublicTopic(dayKey: string) {
    const pastTopics =
      await this.topicRepository.findPreviousPublicTopicConcepts();
    const modelResponse = await this.aiTopicService.getPublicModelResponse(
      pastTopics
    );
    const parsedResponse = parseModelTopicResponse(modelResponse);
    const topic: Topic = {
      ...parsedResponse,
      quiz: {
        ...parsedResponse.quiz,
        id: randomUUID(),
      },
      date: new Date(),
      dayKey,
      public: true,
      id: randomUUID(),
    };
    const result = await this.topicRepository.insertTopicOrReturnExisting(
      topic,
      () => this.topicRepository.findPublicTopicByDayKey(dayKey)
    );

    return result.topic;
  }

  private async createUserTopic(
    userDataToModel: UserDataToModel,
    userId: string,
    dayKey: string
  ) {
    const modelResponse = await this.aiTopicService.getUserModelResponse(
      userDataToModel
    );
    const parsedResponse = parseModelTopicResponse(modelResponse);
    const topic: Topic = {
      ...parsedResponse,
      quiz: {
        ...parsedResponse.quiz,
        id: randomUUID(),
      },
      date: new Date(),
      dayKey,
      userId,
      id: randomUUID(),
      public: false,
    };
    const result = await this.topicRepository.insertTopicOrReturnExisting(
      topic,
      () => this.topicRepository.findUserTopicByDayKey(userId, dayKey)
    );
    const pastTopicInserted = await this.userRepository.appendPastTopic(
      userId,
      result.topic
    );

    if (!pastTopicInserted) {
      throw new InternalServerErrorException({
        message: "Could not persist topic to user history",
        code: "USER_PAST_TOPIC_NOT_PERSISTED",
      });
    }

    return result.topic;
  }

  private attachUserAnswer(topic: Topic, user: User) {
    const answeredQuiz = user.answeredQuizzes?.find(
      (quiz) => quiz.id === topic.quiz.id
    );

    if (!answeredQuiz) {
      return topic;
    }

    return {
      ...topic,
      quiz: {
        ...topic.quiz,
        userAnswer: answeredQuiz.correctness,
      },
    };
  }
}

const extractPastTopics = (user: User) => {
  const pastConceptTopics = user.pastTopics?.map((topic) => topic.concept);

  if (!pastConceptTopics || pastConceptTopics.length === 0) {
    return null;
  }

  return pastConceptTopics.join(", ");
};

const topicGenerationInProgressException = () =>
  new ConflictException({
    message: "Topic in progress",
    code: "TOPIC_GENERATION_IN_PROGRESS",
  });
