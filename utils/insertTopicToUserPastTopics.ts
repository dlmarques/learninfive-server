import { Topic } from "../types/Topic";
import { User } from "../types/User";
import { client } from "./dbConnect";

export const insertTopicToUserPastTopics = async (
  topic: Topic,
  userId: string
) => {
  const database = client.db("users");

  const users = database.collection<User>("user");

  const userResult = await users.findOne({ userId });

  const pastTopics = userResult?.pastTopics ? [...userResult.pastTopics] : [];

  const userUpdateResult = await users.updateOne(
    { userId },
    {
      $set: {
        ...userResult,
        pastTopics: [...pastTopics, { id: topic.id, concept: topic.concept }],
      },
    }
  );
  if (userUpdateResult.modifiedCount > 0) {
    return true;
  }
  return false;
};
