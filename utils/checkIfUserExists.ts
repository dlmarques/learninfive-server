import { User } from "../types/User";
import { client } from "./dbConnect";

export const checkIfUserExists = async (userId: string) => {
  const database = client.db("users");
  const users = database.collection<User>("user");

  const userResult = await users.findOne({ userId });

  return userResult?._id ? true : false;
};
