import { v4 as uuidv4 } from "uuid";
import {
  TopicGenerationLock,
  TopicGenerationLockScope,
} from "../types/TopicGenerationLock";
import { client } from "./dbConnect";
import { isDuplicateKeyError } from "./topicRepository";

const DEFAULT_LOCK_TTL_MS = 2 * 60 * 1000;

const getLockTtlMs = () => {
  const configuredTtl = Number(process.env.TOPIC_GENERATION_LOCK_TTL_MS);

  if (Number.isFinite(configuredTtl) && configuredTtl > 0) {
    return configuredTtl;
  }

  return DEFAULT_LOCK_TTL_MS;
};

const getLockCollection = () => {
  const database = client.db("topics");

  return database.collection<TopicGenerationLock>("topicGenerationLocks");
};

export class TopicGenerationInProgressError extends Error {
  constructor() {
    super("Topic in progress");
    this.name = "TopicGenerationInProgressError";
  }
}

export const buildTopicGenerationLockId = ({
  scope,
  userId,
  dayKey,
}: {
  scope: TopicGenerationLockScope;
  userId?: string;
  dayKey: string;
}) => {
  if (scope === "public") {
    return `topic-generation:public:${dayKey}`;
  }

  if (!userId) {
    throw new Error("User topic generation locks require a userId");
  }

  return `topic-generation:user:${userId}:${dayKey}`;
};

const acquireTopicGenerationLock = async ({
  lockId,
  ownerId,
  scope,
  userId,
  dayKey,
}: {
  lockId: string;
  ownerId: string;
  scope: TopicGenerationLockScope;
  userId?: string;
  dayKey: string;
}) => {
  const locks = getLockCollection();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + getLockTtlMs());

  try {
    const lock = await locks.findOneAndUpdate(
      {
        _id: lockId,
        $or: [{ expiresAt: { $lte: now } }, { ownerId }],
      },
      {
        $set: {
          ownerId,
          scope,
          userId,
          dayKey,
          expiresAt,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      {
        upsert: true,
        returnDocument: "after",
      }
    );

    return lock?.ownerId === ownerId;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return false;
    }

    throw error;
  }
};

const releaseTopicGenerationLock = async (lockId: string, ownerId: string) => {
  const locks = getLockCollection();

  await locks.deleteOne({ _id: lockId, ownerId });
};

export const withTopicGenerationLock = async <T>(
  options: {
    scope: TopicGenerationLockScope;
    userId?: string;
    dayKey: string;
  },
  callback: () => Promise<T>
) => {
  const ownerId = uuidv4();
  const lockId = buildTopicGenerationLockId(options);
  const acquired = await acquireTopicGenerationLock({
    ...options,
    lockId,
    ownerId,
  });

  if (!acquired) {
    throw new TopicGenerationInProgressError();
  }

  try {
    return await callback();
  } finally {
    try {
      await releaseTopicGenerationLock(lockId, ownerId);
    } catch (error) {
      console.error(error);
    }
  }
};
