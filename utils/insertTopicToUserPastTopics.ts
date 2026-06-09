import { Topic } from "../types/Topic";
import { User } from "../types/User";
import { client } from "./dbConnect";

export const insertTopicToUserPastTopics = async (
  topic: Topic,
  userId: string
) => {
  const database = client.db("users");

  const users = database.collection<User>("user");

  const userUpdateResult = await users.updateOne(
    { userId },
    {
      $addToSet: {
        pastTopics: { id: topic.id, concept: topic.concept },
      },
    }
  );

  if (userUpdateResult.matchedCount > 0) {
    return true;
  }

  return false;
};
