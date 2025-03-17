import { client } from "../utils/dbConnect";
import { decode } from "jsonwebtoken";
import { extractTokenFromHeaders } from "../utils/extractTokenFromHeaders";
import { User } from "../types/User";
import { Request, Response } from "express";

export const checkUserProfile = async (req: Request, res: Response) => {
  const token = extractTokenFromHeaders(req);

  const userId = decode(token)?.sub;

  const database = client.db("users");

  const users = database.collection<User>("users");

  const userResult = await users.findOne({ userId: userId });

  if (userResult?._id) {
    res.status(200).send({
      success: true,
      content: "User already registered.",
      exists: true,
    });
  }
  res.status(200).send({
    success: true,
    content: "User not registered.",
    exists: false,
  });
};
