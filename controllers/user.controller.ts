import { client } from "../utils/dbConnect";
import { decode } from "jsonwebtoken";
import { extractTokenFromHeaders } from "../utils/extractTokenFromHeaders";
import { User } from "../types/User";
import { Request, Response } from "express";
import { insertNewUser } from "../utils/insertNewUser";
import { checkIfUserExists } from "../utils/checkIfUserExists";

export const checkUserProfile = async (req: Request, res: Response) => {
  const token = extractTokenFromHeaders(req);

  const userId = decode(token)?.sub;

  const database = client.db("users");

  const users = database.collection<User>("user");

  const userResult = await users.findOne({ userId });

  if (userResult?._id) {
    res.status(200).send({
      success: true,
      content: "User already registered.",
      exists: true,
    });
    return;
  }
  res.status(200).send({
    success: true,
    content: "User not registered.",
    exists: false,
  });
  return;
};

export const createUserProfile = async (req: Request, res: Response) => {
  const user = req.body as User;

  const userExists = await checkIfUserExists(user.userId);

  if (userExists) {
    res.status(200).send({ success: false, content: "User already exists." });
    return;
  }

  const insertUserResult = await insertNewUser(user);

  if (insertUserResult) {
    res.status(200).send({ success: true, content: "User created." });
  } else {
    res.status(200).send({ success: false, content: "Something went wrong" });
  }
};
