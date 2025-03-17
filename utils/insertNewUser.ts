import { User } from "../types/User";
import { client } from "./dbConnect";

export const insertNewUser = async (user: User) => {
  try {
    const database = client.db("users");

    const users = database.collection<User>("users");

    const result = await users.insertOne(user);

    return result.insertedId;
  } catch (error) {
    console.error(error);
    return false;
  }
};
