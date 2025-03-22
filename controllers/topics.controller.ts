import { Request, Response } from "express";
import {
  getPublicModelResponse,
  getUserModelResponse,
} from "./model.controller";
import schedule from "node-schedule";
import { getPreviousPublicTopics } from "../utils/getPreviousTopics";
import {
  insertNewUserTopic,
  insertNewPublicTopic,
} from "../utils/insertNewTopic";
import { client } from "../utils/dbConnect";
import { Topic } from "../types/Topic";
import { isToday } from "../utils/isToday";
import { extractTokenFromHeaders } from "../utils/extractTokenFromHeaders";
import { decode } from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { getUserDataById } from "../utils/getUserDataById";
import { extractPastTopics } from "../utils/extractPastTopics";
import { UserDataToModel } from "../types/Model";
import { insertTopicToUserPastTopics } from "../utils/insertTopicToUserPastTopics";
import { insertAnswerToUser } from "../utils/insertAnswerToUser";

const inProgress = new Set();
let publicTopicInProgress: Topic | null;
let usersTopicsInProgress: { [key: string]: Topic } = {};

export const requestAndSaveNewPublicTopic = async () => {
  const pastTopics = await getPreviousPublicTopics();

  const modelResponse = await getPublicModelResponse(pastTopics);

  if (modelResponse) {
    const parsedResponse = JSON.parse(modelResponse);

    const topic: Topic = {
      ...parsedResponse,
      date: new Date(),
      public: true,
      id: uuidv4(),
    };

    publicTopicInProgress = topic;

    const insertPublicTopicResult = await insertNewPublicTopic(topic);

    if (insertPublicTopicResult) {
      return topic;
    } else {
      throw new Error("Something went wrong on model requisition");
    }
  } else {
    throw new Error("Something went wrong on model requisition");
  }
};

export const requestAndSaveNewUserTopic = async (
  userDataToModel: UserDataToModel,
  userId: string
) => {
  const modelResponse = await getUserModelResponse(userDataToModel);

  if (modelResponse) {
    const parsedResponse = JSON.parse(modelResponse);

    const topic: Topic = {
      ...parsedResponse,
      quiz: {
        id: uuidv4(),
        ...parsedResponse.quiz,
      },
      date: new Date(),
      userId,
      id: uuidv4(),
      public: false,
    };

    usersTopicsInProgress[userId] = topic;

    const insertUserTopicResult = await insertNewUserTopic(topic);

    const insertTopicToUserPastTopicsResult = await insertTopicToUserPastTopics(
      topic,
      userId
    );

    if (insertUserTopicResult && insertTopicToUserPastTopicsResult) {
      return topic;
    } else {
      throw new Error("Something went wrong on model requisition");
    }
  } else {
    throw new Error("Something went wrong on model requisition");
  }
};

schedule.scheduleJob("0 0 * * *", requestAndSaveNewPublicTopic);

export const getTopic = async (req: Request, res: Response) => {
  const token = extractTokenFromHeaders(req);

  if (token) {
    getUserTopic(token, res);
  } else {
    getPublicTopic(res);
  }
};

const getPublicTopic = async (res: Response) => {
  if (inProgress.has("public") && publicTopicInProgress) {
    res.status(200).send({ success: true, content: publicTopicInProgress });
    inProgress.delete("public");
    publicTopicInProgress = null;
    return;
  } else if (inProgress.has("public")) {
    res.status(500).send({ success: false, content: "Topic in progress" });
    return;
  }
  const database = client.db("topics");

  const topic = database.collection<Topic>("topic");

  const result = await topic.find({ public: true }).toArray();

  const lastTopic = result.find((topic) => {
    if (isToday(topic.date)) return topic;
  });

  if (lastTopic) {
    res.status(200).send({ success: true, content: lastTopic });
  } else {
    if (!inProgress.has("public")) {
      inProgress.add("public");
      const topic = await requestAndSaveNewPublicTopic();
      res.status(200).send({ success: true, content: topic });
      inProgress.delete("public");
      publicTopicInProgress = null;
    }
  }
};

const getUserTopic = async (token: string, res: Response) => {
  const userId = decode(token)?.sub as string;

  if (inProgress.has(userId) && usersTopicsInProgress[userId]) {
    res
      .status(200)
      .send({ success: true, content: usersTopicsInProgress[userId] });
    inProgress.delete(userId);
    delete usersTopicsInProgress[userId];
    return;
  } else if (inProgress.has(userId)) {
    res.status(500).send({ success: false, content: "Topic in progress" });
    return;
  }

  const database = client.db("topics");

  const topic = database.collection<Topic>("topic");

  const result = await topic.find({ userId }).toArray();

  const userData = await getUserDataById(userId);

  const lastTopic = result.find((topic) => {
    if (isToday(topic.date)) return topic;
  });

  const answeredQuiz = userData?.answeredQuizzes?.find((quiz) => {
    if (quiz.id === lastTopic?.quiz.id) return quiz;
  });

  if (lastTopic) {
    if (answeredQuiz) {
      const topic: Topic = {
        ...lastTopic,
        quiz: { ...lastTopic.quiz, userAnswer: answeredQuiz.correctness },
      };
      res.status(200).send({ success: true, content: topic });
    } else {
      res.status(200).send({ success: true, content: lastTopic });
    }
  } else {
    if (!inProgress.has(userId)) {
      if (userData) {
        inProgress.add(userId);
        const pastTopics = extractPastTopics(userData);
        const topic = await requestAndSaveNewUserTopic(
          {
            pastTopics,
            csLevel: userData.csLevel,
            preferences: userData.preferences,
            topicsToAvoid: userData.topicsToAvoid,
            goals: userData.goals,
          },
          userId
        );
        res.status(200).send({ success: true, content: topic });
        inProgress.delete(userId);
        delete usersTopicsInProgress[userId];
      }
    }
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
