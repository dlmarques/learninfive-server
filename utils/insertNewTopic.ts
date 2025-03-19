import { Topic } from "../types/Topic";
import { client } from "./dbConnect";

export const insertNewPublicTopic = async (newTopic: Topic) => {
  try {
    const database = client.db("topics");

    const topic = database.collection<Topic>("topic");

    const result = await topic.insertOne(newTopic);

    return result.insertedId;
  } catch (error) {
    console.error(error);
    return false;
  }
};

export const insertNewUserTopic = async (newTopic: Topic) => {
  console.log("newTopic", newTopic);
  try {
    const database = client.db("topics");

    const topic = database.collection<Topic>("topic");

    const result = await topic.insertOne(newTopic);

    return result.insertedId;
  } catch (error) {
    console.error(error);
    return false;
  }
};
