import { Topic } from "../types/Topic";
import { client } from "./dbConnect";

export const getPreviousTopics = async () => {
  try {
    const database = client.db("topics");

    const topic = database.collection<Topic>("topic");

    const result = topic.find().toArray();

    const _result = await result;

    const previousTopics = _result.map((topic) => {
      return topic.concept;
    });
    console.log(previousTopics);
    return previousTopics;
  } catch (error) {
    console.error(error);
    return [];
  }
};
