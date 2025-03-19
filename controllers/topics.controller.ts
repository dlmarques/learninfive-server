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

export const requestAndSaveNewPublicTopic = async () => {
  const pastTopics = await getPreviousPublicTopics();

  const modelResponse = await getPublicModelResponse(pastTopics);

  if (modelResponse) {
    const parsedResponse = JSON.parse(modelResponse);

    const topic = {
      ...parsedResponse,
      date: new Date(),
      public: true,
      id: uuidv4(),
    };

    const insertPublicTopicResult = await insertNewPublicTopic(topic);

    if (insertPublicTopicResult) {
      console.log("New public topic generated and inserted sucessfully");
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

    const topic = {
      ...parsedResponse,
      date: new Date(),
      userId,
      id: uuidv4(),
      public: false,
    };

    const insertUserTopicResult = await insertNewUserTopic(topic);

    if (insertUserTopicResult) {
      console.log("New user topic generated and inserted sucessfully");
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
  const database = client.db("topics");

  const topic = database.collection<Topic>("topic");

  const result = await topic.find({ public: true }).toArray();

  const lastTopic = result.find((topic) => {
    if (isToday(topic.date)) return topic;
  });

  if (lastTopic) {
    res.status(200).send({ success: true, content: lastTopic });
  } else {
    const topic = await requestAndSaveNewPublicTopic();
    res.status(200).send({ success: true, content: topic });
  }
};

const getUserTopic = async (token: string, res: Response) => {
  const userId = decode(token)?.sub as string;

  const database = client.db("topics");

  const topic = database.collection<Topic>("topic");

  const result = await topic.find({ userId }).toArray();

  const lastTopic = result.find((topic) => {
    if (isToday(topic.date)) return topic;
  });

  // TODO: check if user has answered quiz

  if (lastTopic) {
    res.status(200).send({ success: true, content: lastTopic });
  } else {
    const userData = await getUserDataById(userId);

    if (userData) {
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
    }
  }
};
