import { User } from "../types/User";
import { client } from "./dbConnect";

export const insertNewUser = async (user: User) => {
  const database = client.db("users");

  const users = database.collection<User>("user");

  const result = await users.insertOne(user);

  return result.insertedId;
};
