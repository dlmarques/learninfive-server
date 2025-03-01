import { Request, Response } from "express";
import { getModelResponse } from "./model.controller";
import schedule from "node-schedule";
import { getPreviousTopics } from "../utils/getPreviousTopics";
import { insertNewTopic } from "../utils/insertNewTopic";
import { client } from "../utils/dbConnect";
import { Topic } from "../types/Topic";
import { isToday } from "../utils/isToday";

export const requestAndSaveNewTopic = async () => {
  const pastTopics = await getPreviousTopics();

  const modelResponse = await getModelResponse(pastTopics);

  if (modelResponse) {
    const parsedResponse = JSON.parse(modelResponse);

    const insertTopicResult = await insertNewTopic({
      ...parsedResponse,
      date: new Date(),
    });

    if (insertTopicResult) {
      console.log("New topic generated and inserted sucessfully");
    }
  } else {
    throw new Error("Something went wrong on model requisition");
  }
};

schedule.scheduleJob("0 0 * * *", requestAndSaveNewTopic);

export const getTopic = async (req: Request, res: Response) => {
  const database = client.db("topics");

  const topic = database.collection<Topic>("topic");

  const result = topic.find().toArray();

  const _result = await result;

  const lastTopic = _result.filter((topic) => {
    if (isToday(topic.date)) return topic;
  });

  if (lastTopic) {
    res.status(200).send({ success: true, content: lastTopic });
  } else {
    res.status(500).send({ success: false, content: {} });
  }
};
