import { Document } from "mongodb";
import { client } from "./dbConnect";

const getUsersCollection = () => {
  return client.db("users").collection("user");
};

const findDuplicateUsers = async (): Promise<Document[]> => {
  const users = getUsersCollection();

  return users
    .aggregate([
      {
        $match: {
          userId: { $exists: true },
        },
      },
      {
        $group: {
          _id: "$userId",
          count: { $sum: 1 },
        },
      },
      {
        $match: {
          count: { $gt: 1 },
        },
      },
    ])
    .toArray();
};

const throwIfDuplicateUsersExist = async () => {
  const duplicates = await findDuplicateUsers();

  if (duplicates.length === 0) {
    return;
  }

  throw new Error(
    `Cannot create unique user indexes while duplicate users exist: ${JSON.stringify(
      duplicates
    )}`
  );
};

const ensureUserIndexes = async () => {
  const users = getUsersCollection();

  await users.createIndex(
    { userId: 1 },
    {
      name: "uniq_user_userId",
      unique: true,
      partialFilterExpression: {
        userId: { $exists: true },
      },
    }
  );
};

export const ensureUserStorage = async () => {
  await throwIfDuplicateUsersExist();
  await ensureUserIndexes();
};

export const inspectDuplicateUsers = findDuplicateUsers;
