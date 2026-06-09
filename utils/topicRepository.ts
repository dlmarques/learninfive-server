import { Topic } from "../types/Topic";
import { client } from "./dbConnect";
import { isDuplicateKeyError } from "./mongoErrors";

const getTopicCollection = () => {
  const database = client.db("topics");

  return database.collection<Topic>("topic");
};

export const findPublicTopicByDayKey = async (dayKey: string) => {
  const topic = getTopicCollection();

  return topic.findOne({ public: true, dayKey });
};

export const findUserTopicByDayKey = async (
  userId: string,
  dayKey: string
) => {
  const topic = getTopicCollection();

  return topic.findOne({ public: false, userId, dayKey });
};

export const insertTopicOrReturnExisting = async (
  newTopic: Topic,
  findExistingTopic: () => Promise<Topic | null>
) => {
  const topic = getTopicCollection();

  try {
    await topic.insertOne(newTopic);

    return { inserted: true, topic: newTopic };
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const existingTopic = await findExistingTopic();

    if (!existingTopic) {
      throw error;
    }

    return { inserted: false, topic: existingTopic };
  }
};
