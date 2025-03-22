import { Topic } from "../types/Topic";
import { client } from "./dbConnect";

export const getPreviousPublicTopics = async () => {
  try {
    const database = client.db("topics");

    const topic = database.collection<Topic>("topic");

    const result = topic.find({ public: true }).toArray();

    const _result = await result;

    const previousTopics = _result.map((topic) => {
      return topic.concept;
    });
    return previousTopics;
  } catch (error) {
    console.error(error);
    return [];
  }
};
