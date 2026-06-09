import { Request, Response } from "express";
import {
  getPublicModelResponse,
  getUserModelResponse,
} from "./model.controller";
import schedule from "node-schedule";
import { getPreviousPublicTopics } from "../utils/getPreviousTopics";
import { client } from "../utils/dbConnect";
import { Topic } from "../types/Topic";
import { extractTokenFromHeaders } from "../utils/extractTokenFromHeaders";
import { decode } from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { getUserDataById } from "../utils/getUserDataById";
import { extractPastTopics } from "../utils/extractPastTopics";
import { UserDataToModel } from "../types/Model";
import { insertTopicToUserPastTopics } from "../utils/insertTopicToUserPastTopics";
import { insertAnswerToUser } from "../utils/insertAnswerToUser";
import { getUtcDayKey } from "../utils/topicDayKey";
import {
  findPublicTopicByDayKey,
  findUserTopicByDayKey,
  insertTopicOrReturnExisting,
} from "../utils/topicRepository";
import {
  TopicGenerationInProgressError,
  withTopicGenerationLock,
} from "../utils/topicGenerationLock";
import { parseModelTopicResponse } from "../utils/parseModelTopicResponse";

const TOPIC_IN_PROGRESS = "Topic in progress";

const createPublicTopic = async (dayKey: string) => {
  const pastTopics = await getPreviousPublicTopics();

  const modelResponse = await getPublicModelResponse(pastTopics);

  if (modelResponse) {
    const parsedResponse = parseModelTopicResponse(modelResponse);

    const topic: Topic = {
      ...parsedResponse,
      quiz: {
        ...parsedResponse.quiz,
        id: uuidv4(),
      },
      date: new Date(),
      dayKey,
      public: true,
      id: uuidv4(),
    };

    const result = await insertTopicOrReturnExisting(topic, () =>
      findPublicTopicByDayKey(dayKey)
    );

    return result.topic;
  } else {
    throw new Error("Something went wrong on model requisition");
  }
};

const createUserTopic = async (
  userDataToModel: UserDataToModel,
  userId: string,
  dayKey: string
) => {
  const modelResponse = await getUserModelResponse(userDataToModel);

  if (modelResponse) {
    const parsedResponse = parseModelTopicResponse(modelResponse);

    const topic: Topic = {
      ...parsedResponse,
      quiz: {
        id: uuidv4(),
        ...parsedResponse.quiz,
      },
      date: new Date(),
      dayKey,
      userId,
      id: uuidv4(),
      public: false,
    };

    const result = await insertTopicOrReturnExisting(topic, () =>
      findUserTopicByDayKey(userId, dayKey)
    );

    const insertTopicToUserPastTopicsResult = await insertTopicToUserPastTopics(
      result.topic,
      userId
    );

    if (!insertTopicToUserPastTopicsResult) {
      throw new Error("Something went wrong on model requisition");
    }

    return result.topic;
  } else {
    throw new Error("Something went wrong on model requisition");
  }
};

export const getOrCreatePublicTopicForDay = async (
  dayKey = getUtcDayKey()
) => {
  const existingTopic = await findPublicTopicByDayKey(dayKey);

  if (existingTopic) {
    return existingTopic;
  }

  return withTopicGenerationLock(
    {
      scope: "public",
      dayKey,
    },
    async () => {
      const existingTopicAfterLock = await findPublicTopicByDayKey(dayKey);

      if (existingTopicAfterLock) {
        return existingTopicAfterLock;
      }

      return createPublicTopic(dayKey);
    }
  );
};

export const getOrCreateUserTopicForDay = async (
  userDataToModel: UserDataToModel,
  userId: string,
  dayKey = getUtcDayKey()
) => {
  const existingTopic = await findUserTopicByDayKey(userId, dayKey);

  if (existingTopic) {
    return existingTopic;
  }

  return withTopicGenerationLock(
    {
      scope: "user",
      userId,
      dayKey,
    },
    async () => {
      const existingTopicAfterLock = await findUserTopicByDayKey(
        userId,
        dayKey
      );

      if (existingTopicAfterLock) {
        return existingTopicAfterLock;
      }

      return createUserTopic(userDataToModel, userId, dayKey);
    }
  );
};

export const requestAndSaveNewPublicTopic = async () => {
  return getOrCreatePublicTopicForDay();
};

export const requestAndSaveNewUserTopic = async (
  userDataToModel: UserDataToModel,
  userId: string
) => {
  return getOrCreateUserTopicForDay(userDataToModel, userId);
};

if (process.env.NODE_ENV !== "test") {
  schedule.scheduleJob("0 0 * * *", () => {
    requestAndSaveNewPublicTopic().catch((error) => {
      console.error(error);
    });
  });
}

export const getTopic = async (req: Request, res: Response) => {
  const token = extractTokenFromHeaders(req);

  try {
    if (token) {
      await getUserTopic(token, res);
    } else {
      await getPublicTopic(res);
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, content: "Something went wrong" });
  }
};

const getPublicTopic = async (res: Response) => {
  try {
    const topic = await getOrCreatePublicTopicForDay();

    res.status(200).send({ success: true, content: topic });
  } catch (error) {
    if (error instanceof TopicGenerationInProgressError) {
      res.status(500).send({ success: false, content: TOPIC_IN_PROGRESS });
      return;
    }

    throw error;
  }
};

const getUserTopic = async (token: string, res: Response) => {
  const userId = decode(token)?.sub as string;

  const dayKey = getUtcDayKey();
  const existingTopic = await findUserTopicByDayKey(userId, dayKey);

  const userData = await getUserDataById(userId);

  if (existingTopic) {
    const answeredQuiz = userData?.answeredQuizzes?.find((quiz) => {
      if (quiz.id === existingTopic.quiz.id) return quiz;
    });

    if (answeredQuiz) {
      const topicWithAnswer: Topic = {
        ...existingTopic,
        quiz: { ...existingTopic.quiz, userAnswer: answeredQuiz.correctness },
      };

      res.status(200).send({ success: true, content: topicWithAnswer });
    } else {
      res.status(200).send({ success: true, content: existingTopic });
    }

    return;
  }

  if (!userData) {
    res.status(404).send({ success: false, content: "User not found" });
    return;
  }

  try {
    const topic = await getOrCreateUserTopicForDay(
      {
        pastTopics: extractPastTopics(userData),
        csLevel: userData.csLevel,
        preferences: userData.preferences,
        topicsToAvoid: userData.topicsToAvoid,
        goals: userData.goals,
      },
      userId,
      dayKey
    );

    res.status(200).send({ success: true, content: topic });
  } catch (error) {
    if (error instanceof TopicGenerationInProgressError) {
      res.status(500).send({ success: false, content: TOPIC_IN_PROGRESS });
      return;
    }

    throw error;
  }
};

export const answerQuiz = async (req: Request, res: Response) => {
  const token = extractTokenFromHeaders(req);

  const { answer, topicId } = req.body;

  const database = client.db("topics");

  const topic = database.collection<Topic>("topic");

  if (!token) {
    const result = await topic.findOne({ id: topicId });

    if (result) {
      const { quiz } = result;

      res.status(200).send({
        success: true,
        content: "Quiz answered correctly",
        correct: quiz.rightAnswer === answer,
      });
    }
  } else {
    const userId = decode(token)?.sub as string;

    const result = await topic.findOne({ id: topicId, userId });

    if (result) {
      const { quiz } = result;
      const isCorrect = quiz.rightAnswer === answer;

      const insertAnswerToUserResult = await insertAnswerToUser(
        userId,
        quiz.id,
        isCorrect
      );

      if (insertAnswerToUserResult) {
        res.status(200).send({
          success: true,
          content: "Quiz answered correctly",
          correct: isCorrect,
        });
      } else {
        res.status(200).send({
          success: false,
          content: "Something went wrong",
        });
      }
    }
  }
};
