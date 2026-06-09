import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Request, Response } from "express";
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

vi.mock("@clerk/backend", () => ({
  verifyToken: vi.fn(),
}));

vi.mock("jsonwebtoken", () => ({
  decode: vi.fn(),
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

const createRequest = ({
  body = {},
  authorization,
}: {
  body?: Record<string, unknown>;
  authorization?: string;
} = {}) =>
  ({
    body,
    headers: authorization ? { authorization } : {},
  }) as Request;

const createResponse = () => {
  const response = {} as Response & {
    status: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };

  response.status = vi.fn().mockReturnValue(response);
  response.send = vi.fn().mockReturnValue(response);
  response.json = vi.fn().mockReturnValue(response);

  return response;
};

describe("backend topic, profile, auth, and quiz flows", () => {
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let clerkBackend: typeof import("@clerk/backend");
  let jsonwebtoken: typeof import("jsonwebtoken");
  let modelController: typeof import("../controllers/model.controller");
  let topicController: typeof import("../controllers/topics.controller");
  let userController: typeof import("../controllers/user.controller");
  let verifyTokenMiddlewareModule: typeof import("../middlewares/verifyToken");
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

  const buildUserTopic = (dayKey: string, userId: string): Topic => ({
    id: "00000000-0000-4000-8000-000000000001",
    concept: "Persisted Quiz Topic",
    definition: "Definition",
    realWorldAnalogy: "Analogy",
    examples: [{ language: "JavaScript", code: "console.log('test')" }],
    quiz: {
      id: "quiz-1",
      question: "Question?",
      answers: [
        { id: "answer-1", content: "Answer 1" },
        { id: "answer-2", content: "Answer 2" },
      ],
      rightAnswer: "answer-1",
    },
    date: new Date(`${dayKey}T12:00:00.000Z`),
    dayKey,
    public: false,
    userId,
  });

  const mockDecodedTokenSubject = (userId: string) => {
    vi.mocked(jsonwebtoken.decode).mockReturnValue({ sub: userId } as never);
  };

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
    const userStorageMaintenance = await import(
      "../utils/userStorageMaintenance"
    );

    client = dbConnect.client;
    await dbConnect.runDB();
    await topicStorageMaintenance.ensureTopicStorage();
    await userStorageMaintenance.ensureUserStorage();

    clerkBackend = await import("@clerk/backend");
    jsonwebtoken = await import("jsonwebtoken");
    modelController = await import("../controllers/model.controller");
    topicController = await import("../controllers/topics.controller");
    userController = await import("../controllers/user.controller");
    verifyTokenMiddlewareModule = await import("../middlewares/verifyToken");
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

  it("enforces unique topic ids at the database layer", async () => {
    await client
      .db("topics")
      .collection("topic")
      .insertOne(buildPublicTopic("2024-04-01", "shared-topic-id"));

    await expect(
      client
        .db("topics")
        .collection("topic")
        .insertOne(buildPublicTopic("2024-04-02", "shared-topic-id"))
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("enforces unique user ids at the database layer", async () => {
    await insertUser("unique-profile-user");

    await expect(insertUser("unique-profile-user")).rejects.toMatchObject({
      code: 11000,
    });
  });

  it("returns an existing public topic without generating another one", async () => {
    const dayKey = "2024-03-10";
    const existingTopic = buildPublicTopic(dayKey, "existing-public");

    await client.db("topics").collection("topic").insertOne(existingTopic);

    await expect(
      topicController.getOrCreatePublicTopicForDay(dayKey)
    ).resolves.toMatchObject({
      id: "existing-public",
      concept: "Concept existing-public",
      dayKey,
      public: true,
    });

    expect(modelController.getPublicModelResponse).not.toHaveBeenCalled();

    const persistedCount = await client
      .db("topics")
      .collection("topic")
      .countDocuments({ public: true, dayKey });

    expect(persistedCount).toBe(1);
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

  it("records generated user topics in the user's past topics", async () => {
    const dayKey = "2024-03-11";
    const userId = "user-1";
    const userModelData = {
      pastTopics: [],
      csLevel: "beginner",
      preferences: "TypeScript",
      goals: "learn backend systems",
      topicsToAvoid: "hardware",
    };

    await insertUser(userId);

    vi.mocked(modelController.getUserModelResponse).mockResolvedValue(
      topicJson("User Past Topic")
    );

    const topic = await topicController.getOrCreateUserTopicForDay(
      userModelData,
      userId,
      dayKey
    );

    const user = await client.db("users").collection("user").findOne({
      userId,
    });

    expect(topic).toMatchObject({
      concept: "User Past Topic",
      dayKey,
      public: false,
      userId,
    });
    expect(user?.pastTopics).toEqual([
      { id: topic.id, concept: "User Past Topic" },
    ]);
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

  it("creates a profile and rejects concurrent duplicate profile creation", async () => {
    const profile = {
      userId: "profile-user",
      csLevel: "beginner",
      goals: "learn TypeScript",
      preferences: "short examples",
      topicsToAvoid: "assembly",
    };

    mockDecodedTokenSubject(profile.userId);

    const firstResponse = createResponse();
    const secondResponse = createResponse();

    await Promise.all([
      userController.createUserProfile(
        createRequest({
          authorization: "Bearer valid-token",
          body: profile,
        }),
        firstResponse
      ),
      userController.createUserProfile(
        createRequest({
          authorization: "Bearer valid-token",
          body: profile,
        }),
        secondResponse
      ),
    ]);

    expect(firstResponse.status).toHaveBeenCalledWith(200);
    expect(secondResponse.status).toHaveBeenCalledWith(200);
    expect([
      firstResponse.send.mock.calls[0]?.[0],
      secondResponse.send.mock.calls[0]?.[0],
    ]).toEqual(
      expect.arrayContaining([
        {
          success: true,
          content: "User created.",
        },
        {
          success: false,
          content: "User already exists.",
        },
      ])
    );

    const persistedUser = await client.db("users").collection("user").findOne({
      userId: profile.userId,
    });

    expect(persistedUser).toMatchObject(profile);

    const persistedCount = await client
      .db("users")
      .collection("user")
      .countDocuments({ userId: profile.userId });

    expect(persistedCount).toBe(1);
  });

  it("rejects profile creation when body userId differs from the token subject", async () => {
    const response = createResponse();

    mockDecodedTokenSubject("authenticated-user");

    await userController.createUserProfile(
      createRequest({
        authorization: "Bearer valid-token",
        body: {
          userId: "different-user",
          csLevel: "beginner",
          goals: "learn TypeScript",
          preferences: "short examples",
          topicsToAvoid: "assembly",
        },
      }),
      response
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.send).toHaveBeenCalledWith({
      success: false,
      content: "Profile userId does not match authenticated user.",
    });

    const persistedCount = await client
      .db("users")
      .collection("user")
      .countDocuments({});

    expect(persistedCount).toBe(0);
  });

  it("edits an authenticated profile without clearing quiz history", async () => {
    const userId = "profile-user";

    await client.db("users").collection("user").insertOne({
      userId,
      csLevel: "beginner",
      goals: "learn TypeScript",
      preferences: "short examples",
      topicsToAvoid: "assembly",
      answeredQuizzes: [{ id: "quiz-1", correctness: true }],
    });

    mockDecodedTokenSubject(userId);

    const response = createResponse();

    await userController.editProfile(
      createRequest({
        authorization: "Bearer valid-token",
        body: {
          userId,
          csLevel: "advanced",
          goals: "design distributed systems",
          preferences: "deep dives",
          topicsToAvoid: "CSS",
        },
      }),
      response
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send).toHaveBeenCalledWith({
      success: true,
      content: "User edited successfully",
      edited: true,
    });

    const persistedUser = await client.db("users").collection("user").findOne({
      userId,
    });

    expect(persistedUser).toMatchObject({
      userId,
      csLevel: "advanced",
      goals: "design distributed systems",
      preferences: "deep dives",
      topicsToAvoid: "CSS",
      answeredQuizzes: [{ id: "quiz-1", correctness: true }],
    });
  });

  it("rejects profile edits when body userId differs from the token subject", async () => {
    const userId = "profile-user";

    await client.db("users").collection("user").insertOne({
      userId,
      csLevel: "beginner",
      goals: "learn TypeScript",
      preferences: "short examples",
      topicsToAvoid: "assembly",
    });

    mockDecodedTokenSubject(userId);

    const response = createResponse();

    await userController.editProfile(
      createRequest({
        authorization: "Bearer valid-token",
        body: {
          userId: "different-user",
          csLevel: "advanced",
          goals: "design distributed systems",
          preferences: "deep dives",
          topicsToAvoid: "CSS",
        },
      }),
      response
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.send).toHaveBeenCalledWith({
      success: false,
      content: "Profile userId does not match authenticated user.",
    });

    const persistedUser = await client.db("users").collection("user").findOne({
      userId,
    });

    expect(persistedUser).toMatchObject({
      userId,
      csLevel: "beginner",
      goals: "learn TypeScript",
      preferences: "short examples",
      topicsToAvoid: "assembly",
    });
  });

  it("rejects protected requests when the bearer token is missing", async () => {
    const response = createResponse();
    const next = vi.fn();

    await verifyTokenMiddlewareModule.verifyTokenMiddleware(
      createRequest(),
      response,
      next
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      error: "Token not found. User must sign in.",
    });
    expect(clerkBackend.verifyToken).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("passes protected requests after Clerk verifies the bearer token", async () => {
    vi.mocked(clerkBackend.verifyToken).mockResolvedValue({
      sub: "profile-user",
    } as never);

    const response = createResponse();
    const next = vi.fn();

    await verifyTokenMiddlewareModule.verifyTokenMiddleware(
      createRequest({ authorization: "Bearer valid-token" }),
      response,
      next
    );

    expect(clerkBackend.verifyToken).toHaveBeenCalledWith(
      "valid-token",
      expect.objectContaining({
        jwtKey: process.env.CLERK_JWT_KEY,
        authorizedParties: expect.arrayContaining([
          "http://localhost:3000",
          "https://www.learninfive.com",
          "https://learninfive.com",
        ]),
      })
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });

  it("rejects protected requests when Clerk cannot verify the bearer token", async () => {
    vi.mocked(clerkBackend.verifyToken).mockRejectedValue(
      new Error("invalid token")
    );

    const response = createResponse();
    const next = vi.fn();

    await verifyTokenMiddlewareModule.verifyTokenMiddleware(
      createRequest({ authorization: "Bearer invalid-token" }),
      response,
      next
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      error: "Token not verified.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("persists authenticated quiz answers and replays them with the daily topic", async () => {
    const userId = "quiz-user";
    const dayKey = topicDayKey.getUtcDayKey();
    const topic = buildUserTopic(dayKey, userId);

    await client.db("users").collection("user").insertOne({
      userId,
      csLevel: "beginner",
      goals: "learn TypeScript",
      preferences: "short examples",
    });
    await client.db("topics").collection("topic").insertOne(topic);

    mockDecodedTokenSubject(userId);

    const answerResponse = createResponse();

    await topicController.answerQuiz(
      createRequest({
        authorization: "Bearer valid-token",
        body: {
          topicId: topic.id,
          answer: "answer-1",
        },
      }),
      answerResponse
    );

    expect(answerResponse.status).toHaveBeenCalledWith(200);
    expect(answerResponse.send).toHaveBeenCalledWith({
      success: true,
      content: "Quiz answered correctly",
      correct: true,
    });

    const persistedUser = await client.db("users").collection("user").findOne({
      userId,
    });

    expect(persistedUser?.answeredQuizzes).toEqual([
      { id: "quiz-1", correctness: true },
    ]);

    const topicResponse = createResponse();

    await topicController.getTopic(
      createRequest({ authorization: "Bearer valid-token" }),
      topicResponse
    );

    expect(topicResponse.status).toHaveBeenCalledWith(200);
    expect(topicResponse.send).toHaveBeenCalledWith({
      success: true,
      content: expect.objectContaining({
        id: topic.id,
        quiz: expect.objectContaining({
          id: "quiz-1",
          userAnswer: true,
        }),
      }),
    });
  });
});
