import { Document } from "mongodb";
import { client } from "./dbConnect";
import { getUtcDayKey } from "./topicDayKey";

interface DuplicateReport {
  publicTopics: Document[];
  userTopics: Document[];
}

const getTopicsCollection = () => {
  return client.db("topics").collection("topic");
};

const getLocksCollection = () => {
  return client.db("topics").collection("topicGenerationLocks");
};

const backfillTopicDayKeys = async () => {
  const topics = getTopicsCollection();
  const cursor = topics.find({
    dayKey: { $exists: false },
    date: { $exists: true },
  });

  for await (const topic of cursor) {
    const date = topic.date instanceof Date ? topic.date : new Date(topic.date);

    if (Number.isNaN(date.getTime())) {
      continue;
    }

    await topics.updateOne(
      { _id: topic._id },
      { $set: { dayKey: getUtcDayKey(date) } }
    );
  }
};

const findDuplicateTopics = async (): Promise<DuplicateReport> => {
  const topics = getTopicsCollection();

  const publicTopics = await topics
    .aggregate([
      {
        $match: {
          public: true,
          dayKey: { $exists: true },
        },
      },
      {
        $group: {
          _id: "$dayKey",
          count: { $sum: 1 },
          ids: { $push: "$id" },
          concepts: { $push: "$concept" },
        },
      },
      {
        $match: {
          count: { $gt: 1 },
        },
      },
    ])
    .toArray();

  const userTopics = await topics
    .aggregate([
      {
        $match: {
          public: false,
          userId: { $exists: true },
          dayKey: { $exists: true },
        },
      },
      {
        $group: {
          _id: {
            dayKey: "$dayKey",
            userId: "$userId",
          },
          count: { $sum: 1 },
          ids: { $push: "$id" },
          concepts: { $push: "$concept" },
        },
      },
      {
        $match: {
          count: { $gt: 1 },
        },
      },
    ])
    .toArray();

  return {
    publicTopics,
    userTopics,
  };
};

const throwIfDuplicateTopicsExist = async () => {
  const duplicates = await findDuplicateTopics();

  if (duplicates.publicTopics.length === 0 && duplicates.userTopics.length === 0) {
    return;
  }

  throw new Error(
    `Cannot create unique topic indexes while duplicate daily topics exist: ${JSON.stringify(
      duplicates
    )}`
  );
};

const ensureTopicIndexes = async () => {
  const topics = getTopicsCollection();

  await topics.createIndex(
    { dayKey: 1 },
    {
      name: "uniq_public_topic_day",
      unique: true,
      partialFilterExpression: {
        public: true,
        dayKey: { $exists: true },
      },
    }
  );

  await topics.createIndex(
    { dayKey: 1, userId: 1 },
    {
      name: "uniq_user_topic_day",
      unique: true,
      partialFilterExpression: {
        public: false,
        userId: { $exists: true },
        dayKey: { $exists: true },
      },
    }
  );
};

const ensureTopicGenerationLockIndexes = async () => {
  const locks = getLocksCollection();

  await locks.createIndex(
    { expiresAt: 1 },
    {
      name: "ttl_topic_generation_locks_expires_at",
      expireAfterSeconds: 0,
    }
  );
};

export const ensureTopicStorage = async () => {
  await backfillTopicDayKeys();
  await throwIfDuplicateTopicsExist();
  await ensureTopicIndexes();
  await ensureTopicGenerationLockIndexes();
};

export const inspectDuplicateTopics = findDuplicateTopics;
