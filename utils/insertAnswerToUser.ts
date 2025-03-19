import { User } from "../types/User";
import { client } from "./dbConnect";

export const insertAnswerToUser = async (
  userId: string,
  quizId: string,
  correctness: boolean
) => {
  const database = client.db("users");

  const users = database.collection<User>("user");

  const userResult = await users.findOne({ userId });

  const pastAnswers = userResult?.answeredQuizzes
    ? [...userResult.answeredQuizzes]
    : [];

  const userUpdateResult = await users.updateOne(
    { userId },
    {
      $set: {
        ...userResult,
        answeredQuizzes: [
          ...pastAnswers,
          { id: quizId, correctness: correctness },
        ],
      },
    }
  );
  if (userUpdateResult.modifiedCount > 0) {
    return true;
  }
  return false;
};
