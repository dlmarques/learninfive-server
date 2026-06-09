import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Topic } from "../types/Topic";
import { InvalidModelTopicResponseError } from "../utils/parseModelTopicResponse";

vi.mock("../controllers/model.controller", () => ({
  getPublicModelResponse: vi.fn(),
  getUserModelResponse: vi.fn(),
}));

const topicJson = (concept: string) =>
  JSON.stringify({
    concept,
    definition: `${concept} definition`,
    realWorldAnalogy: `${concept} analogy`,
    examples: [{ language: "JavaScript", code: "console.log('test')" }],
    quiz: {
      question: `${concept}?`,
      answers: [{ id: "answer-1", content: "Answer 1" }],
      rightAnswer: "answer-1",
    },
  });

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((_resolve) => {
    resolve = _resolve;
  });

  return { promise, resolve };
};

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

describe("topic generation coordination", () => {
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let modelController: typeof import("../controllers/model.controller");
  let topicController: typeof import("../controllers/topics.controller");
  let topicGenerationLock: typeof import("../utils/topicGenerationLock");
  let topicRepository: typeof import("../utils/topicRepository");
  let topicDayKey: typeof import("../utils/topicDayKey");

  const waitForLock = async (lockId: string) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const lock = await client
        .db("topics")
        .collection("topicGenerationLocks")
        .findOne({ _id: lockId });

      if (lock) {
        return lock;
      }

      await wait(10);
    }

    throw new Error(`Timed out waiting for lock ${lockId}`);
  };

  const clearDatabase = async () => {
    await client.db("topics").collection("topic").deleteMany({});
    await client.db("topics").collection("topicGenerationLocks").deleteMany({});
    await client.db("users").collection("user").deleteMany({});
  };

  const insertUser = async (userId: string) => {
    await client.db("users").collection("user").insertOne({
      userId,
      csLevel: "beginner",
      goals: "learn backend systems",
      preferences: "TypeScript",
    });
  };

  const buildPublicTopic = (dayKey: string, id: string): Topic => ({
    id,
    concept: `Concept ${id}`,
    definition: "Definition",
    realWorldAnalogy: "Analogy",
    examples: [{ language: "JavaScript", code: "console.log('test')" }],
    quiz: {
      id: `quiz-${id}`,
      question: "Question?",
      answers: [{ id: "answer-1", content: "Answer 1" }],
      rightAnswer: "answer-1",
    },
    date: new Date(`${dayKey}T12:00:00.000Z`),
    dayKey,
    public: true,
  });

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.TOPIC_GENERATION_LOCK_TTL_MS = "60000";

    mongoServer = await MongoMemoryServer.create({
      instance: {
        ip: "127.0.0.1",
      },
    });
    process.env.MONGO_DB_URI = mongoServer.getUri();

    const dbConnect = await import("../utils/dbConnect");
    const topicStorageMaintenance = await import(
      "../utils/topicStorageMaintenance"
    );

    client = dbConnect.client;
    await dbConnect.runDB();
    await topicStorageMaintenance.ensureTopicStorage();

    modelController = await import("../controllers/model.controller");
    topicController = await import("../controllers/topics.controller");
    topicGenerationLock = await import("../utils/topicGenerationLock");
    topicRepository = await import("../utils/topicRepository");
    topicDayKey = await import("../utils/topicDayKey");
  });

  afterEach(async () => {
    await clearDatabase();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await client?.close();
    await mongoServer?.stop();
  });

  it("generates UTC day keys", () => {
    expect(topicDayKey.getUtcDayKey(new Date("2024-03-01T23:30:00.000Z"))).toBe(
      "2024-03-01"
    );
  });

  it("prevents concurrent public generation from calling the model twice", async () => {
    const dayKey = "2024-03-02";
    const lockId = `topic-generation:public:${dayKey}`;
    const deferred = createDeferred<string>();

    vi.mocked(modelController.getPublicModelResponse).mockReturnValue(
      deferred.promise
    );

    const firstRequest = topicController.getOrCreatePublicTopicForDay(dayKey);
    await waitForLock(lockId);

    await expect(
      topicController.getOrCreatePublicTopicForDay(dayKey)
    ).rejects.toBeInstanceOf(
      topicGenerationLock.TopicGenerationInProgressError
    );

    deferred.resolve(topicJson("Public Locking"));

    await expect(firstRequest).resolves.toMatchObject({
      concept: "Public Locking",
      dayKey,
      public: true,
    });

    expect(modelController.getPublicModelResponse).toHaveBeenCalledTimes(1);

    const persistedCount = await client
      .db("topics")
      .collection("topic")
      .countDocuments({ public: true, dayKey });

    expect(persistedCount).toBe(1);
  });

  it("prevents concurrent same-user generation from calling the model twice", async () => {
    const dayKey = "2024-03-03";
    const userId = "user-1";
    const lockId = `topic-generation:user:${userId}:${dayKey}`;
    const deferred = createDeferred<string>();
    const userModelData = {
      pastTopics: [],
      csLevel: "beginner",
      preferences: "TypeScript",
      goals: "learn backend systems",
    };

    await insertUser(userId);

    vi.mocked(modelController.getUserModelResponse).mockReturnValue(
      deferred.promise
    );

    const firstRequest = topicController.getOrCreateUserTopicForDay(
      userModelData,
      userId,
      dayKey
    );
    await waitForLock(lockId);

    await expect(
      topicController.getOrCreateUserTopicForDay(userModelData, userId, dayKey)
    ).rejects.toBeInstanceOf(
      topicGenerationLock.TopicGenerationInProgressError
    );

    deferred.resolve(topicJson("User Locking"));

    await expect(firstRequest).resolves.toMatchObject({
      concept: "User Locking",
      dayKey,
      public: false,
      userId,
    });

    expect(modelController.getUserModelResponse).toHaveBeenCalledTimes(1);

    const persistedCount = await client
      .db("topics")
      .collection("topic")
      .countDocuments({ public: false, userId, dayKey });

    expect(persistedCount).toBe(1);
  });

  it("allows different users to generate independently for the same day", async () => {
    const dayKey = "2024-03-04";
    const userModelData = {
      pastTopics: [],
      csLevel: "beginner",
      preferences: "TypeScript",
      goals: "learn backend systems",
    };

    await insertUser("user-1");
    await insertUser("user-2");

    vi.mocked(modelController.getUserModelResponse).mockResolvedValue(
      topicJson("Independent User")
    );

    await expect(
      Promise.all([
        topicController.getOrCreateUserTopicForDay(
          userModelData,
          "user-1",
          dayKey
        ),
        topicController.getOrCreateUserTopicForDay(
          userModelData,
          "user-2",
          dayKey
        ),
      ])
    ).resolves.toHaveLength(2);

    expect(modelController.getUserModelResponse).toHaveBeenCalledTimes(2);

    const persistedCount = await client
      .db("topics")
      .collection("topic")
      .countDocuments({ public: false, dayKey });

    expect(persistedCount).toBe(2);
  });

  it("returns in-progress while an active lock exists", async () => {
    const dayKey = "2024-03-05";

    await topicGenerationLock.withTopicGenerationLock(
      { scope: "public", dayKey },
      async () => {
        await expect(
          topicController.getOrCreatePublicTopicForDay(dayKey)
        ).rejects.toBeInstanceOf(
          topicGenerationLock.TopicGenerationInProgressError
        );
      }
    );

    expect(modelController.getPublicModelResponse).not.toHaveBeenCalled();
  });

  it("allows an expired lock to be acquired", async () => {
    const dayKey = "2024-03-06";
    const now = new Date();

    await client.db("topics").collection("topicGenerationLocks").insertOne({
      _id: `topic-generation:public:${dayKey}`,
      ownerId: "old-owner",
      scope: "public",
      dayKey,
      expiresAt: new Date(now.getTime() - 1000),
      createdAt: new Date(now.getTime() - 2000),
      updatedAt: new Date(now.getTime() - 2000),
    });

    vi.mocked(modelController.getPublicModelResponse).mockResolvedValue(
      topicJson("Expired Lock")
    );

    await expect(
      topicController.getOrCreatePublicTopicForDay(dayKey)
    ).resolves.toMatchObject({
      concept: "Expired Lock",
      dayKey,
    });

    expect(modelController.getPublicModelResponse).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed public model JSON before inserting a topic", async () => {
    const dayKey = "2024-03-08";

    vi.mocked(modelController.getPublicModelResponse).mockResolvedValue(
      "{not-json"
    );

    await expect(
      topicController.getOrCreatePublicTopicForDay(dayKey)
    ).rejects.toBeInstanceOf(InvalidModelTopicResponseError);

    const persistedCount = await client
      .db("topics")
      .collection("topic")
      .countDocuments({ public: true, dayKey });

    expect(persistedCount).toBe(0);
  });

  it("rejects schema-invalid user model JSON before inserting a topic", async () => {
    const dayKey = "2024-03-09";
    const userId = "user-1";
    const userModelData = {
      pastTopics: [],
      csLevel: "beginner",
      preferences: "TypeScript",
      goals: "learn backend systems",
    };

    await insertUser(userId);

    vi.mocked(modelController.getUserModelResponse).mockResolvedValue(
      JSON.stringify({
        concept: "Invalid User Topic",
        definition: "Definition",
        realWorldAnalogy: "Analogy",
        examples: [{ language: "JavaScript", code: "console.log('test')" }],
        quiz: {
          question: "Question?",
          answers: [{ id: "answer-1", content: "Answer 1" }],
        },
      })
    );

    await expect(
      topicController.getOrCreateUserTopicForDay(userModelData, userId, dayKey)
    ).rejects.toBeInstanceOf(InvalidModelTopicResponseError);

    const persistedCount = await client
      .db("topics")
      .collection("topic")
      .countDocuments({ public: false, userId, dayKey });

    expect(persistedCount).toBe(0);
  });

  it("returns the persisted winner when a duplicate insert races", async () => {
    const dayKey = "2024-03-07";
    const winner = buildPublicTopic(dayKey, "winner");
    const duplicate = buildPublicTopic(dayKey, "duplicate");

    await client.db("topics").collection("topic").insertOne(winner);

    await expect(
      topicRepository.insertTopicOrReturnExisting(duplicate, () =>
        topicRepository.findPublicTopicByDayKey(dayKey)
      )
    ).resolves.toMatchObject({
      inserted: false,
      topic: {
        id: "winner",
        dayKey,
      },
    });
  });

  it("keeps scheduled public generation safe under concurrent invocation", async () => {
    const dayKey = topicDayKey.getUtcDayKey();
    const lockId = `topic-generation:public:${dayKey}`;
    const deferred = createDeferred<string>();

    vi.mocked(modelController.getPublicModelResponse).mockReturnValue(
      deferred.promise
    );

    const firstRequest = topicController.requestAndSaveNewPublicTopic();
    await waitForLock(lockId);

    await expect(
      topicController.requestAndSaveNewPublicTopic()
    ).rejects.toBeInstanceOf(
      topicGenerationLock.TopicGenerationInProgressError
    );

    deferred.resolve(topicJson("Scheduled Public"));

    await expect(firstRequest).resolves.toMatchObject({
      concept: "Scheduled Public",
      dayKey,
    });

    expect(modelController.getPublicModelResponse).toHaveBeenCalledTimes(1);
  });
});
