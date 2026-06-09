import { client } from "../utils/dbConnect";
import { decode, type JwtPayload } from "jsonwebtoken";
import { extractTokenFromHeaders } from "../utils/extractTokenFromHeaders";
import { User } from "../types/User";
import { Request, Response } from "express";
import { insertNewUser } from "../utils/insertNewUser";
import { checkIfUserExists } from "../utils/checkIfUserExists";
import { isDuplicateKeyError } from "../utils/mongoErrors";

const getAuthenticatedUserId = (req: Request) => {
  const token = extractTokenFromHeaders(req);

  if (!token) {
    return null;
  }

  const decodedToken = decode(token);

  if (
    typeof decodedToken === "object" &&
    decodedToken !== null &&
    typeof (decodedToken as JwtPayload).sub === "string"
  ) {
    return (decodedToken as JwtPayload).sub;
  }

  return null;
};

const sendUserNotLoggedIn = (res: Response) => {
  res.status(200).send({ success: false, content: "User not logged in" });
};

const sendUserIdMismatch = (res: Response) => {
  res.status(403).send({
    success: false,
    content: "Profile userId does not match authenticated user.",
  });
};

const sendUserAlreadyExists = (res: Response) => {
  res.status(200).send({ success: false, content: "User already exists." });
};

export const checkUserProfile = async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    sendUserNotLoggedIn(res);
    return;
  }

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
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    sendUserNotLoggedIn(res);
    return;
  }

  if (user.userId !== userId) {
    sendUserIdMismatch(res);
    return;
  }

  const userExists = await checkIfUserExists(userId);

  if (userExists) {
    sendUserAlreadyExists(res);
    return;
  }

  try {
    const insertUserResult = await insertNewUser({
      ...user,
      userId,
    });

    if (insertUserResult) {
      res.status(200).send({ success: true, content: "User created." });
    } else {
      res.status(200).send({ success: false, content: "Something went wrong" });
    }
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      sendUserAlreadyExists(res);
      return;
    }

    console.error(error);
    res.status(200).send({ success: false, content: "Something went wrong" });
  }
};

export const editProfile = async (req: Request, res: Response) => {
  const user = req.body as User;
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    sendUserNotLoggedIn(res);
    return;
  }

  if (user.userId !== userId) {
    sendUserIdMismatch(res);
    return;
  }

  const database = client.db("users");

  const users = database.collection<User>("user");

  const userUpdateResult = await users.updateOne(
    { userId },
    {
      $set: {
        userId,
        csLevel: user.csLevel,
        goals: user.goals,
        preferences: user.preferences,
        topicsToAvoid: user.topicsToAvoid,
      },
    }
  );

  if (userUpdateResult.modifiedCount > 0) {
    res.status(200).send({
      success: true,
      content: "User edited successfully",
      edited: true,
    });
    return;
  }
  res.status(200).send({
    success: true,
    content: "Somethin went wrong",
    edited: false,
  });
  return;
};

export const getUserData = async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    sendUserNotLoggedIn(res);
    return;
  }

  const database = client.db("users");

  const users = database.collection<User>("user");

  const userResult = await users.findOne({ userId });

  if (userResult?._id) {
    res.status(200).send({
      success: true,
      content: userResult,
      exists: true,
    });
    return;
  }
  res.status(200).send({
    success: true,
    content: "User not found",
    exists: false,
  });
  return;
};
