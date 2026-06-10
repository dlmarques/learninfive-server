import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { verifyToken } from "@clerk/backend";
import { AiTopicService } from "../src/ai/ai-topic.service";
import { InvalidModelTopicResponseError } from "../src/ai/model-topic-parser";
import { configureApp } from "../src/app.setup";
import type { Topic } from "../src/domain/topic";
import { MongoDatabaseService } from "../src/persistence/mongo/mongo-database.service";
import { TOPIC_REPOSITORY } from "../src/persistence/repositories/repository.tokens";
import type { TopicRepository } from "../src/persistence/repositories/topic.repository";
import { getUtcDayKey } from "../src/topics/topic-day-key";
import {
  TopicGenerationInProgressError,
  TopicGenerationLockService,
} from "../src/topics/topic-generation-lock.service";
import { TopicsService } from "../src/topics/topics.service";

vi.mock("@clerk/backend", () => ({
  verifyToken: vi.fn(),
}));

const TEST_CLERK_JWT_KEY = "test-clerk-jwt-key";

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

describe("NestJS topic, profile, auth, and quiz flows", () => {
  let app: INestApplication;
  let mongoServer: MongoMemoryServer;
  let databaseService: MongoDatabaseService;
  let aiTopicService: AiTopicService;
  let topicsService: TopicsService;
  let topicGenerationLockService: TopicGenerationLockService;
  let topicRepository: TopicRepository;
  let getPublicModelResponseSpy: ReturnType<typeof vi.spyOn>;
  let getUserModelResponseSpy: ReturnType<typeof vi.spyOn>;

  const mongoClient = () => databaseService.getClient();

  const waitForLock = async (lockId: string) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const lock = await mongoClient()
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
    await mongoClient().db("topics").collection("topic").deleteMany({});
    await mongoClient()
      .db("topics")
      .collection("topicGenerationLocks")
      .deleteMany({});
    await mongoClient().db("users").collection("user").deleteMany({});
  };

  const insertUser = async (userId: string) => {
    await mongoClient().db("users").collection("user").insertOne({
      userId,
      csLevel: "beginner",
      goals: "learn backend systems",
      preferences: "TypeScript",
    });
  };

  const mockVerifiedTokenSubject = (userId: string) => {
    vi.mocked(verifyToken).mockResolvedValue({ sub: userId } as never);
  };

  const auth = (token = "valid-token") => `Bearer ${token}`;

  beforeAll(async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("TOPIC_GENERATION_LOCK_TTL_MS", "60000");
    vi.stubEnv("OPEN_AI_API_KEY", "test-openai-key");
    vi.stubEnv("CLERK_JWT_KEY", TEST_CLERK_JWT_KEY);

    mongoServer = await MongoMemoryServer.create({
      instance: {
        ip: "127.0.0.1",
      },
    });
    vi.stubEnv("MONGO_DB_URI", mongoServer.getUri());
    const { AppModule } = await import("../src/app.module");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication(new FastifyAdapter());
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    databaseService = app.get(MongoDatabaseService);
    aiTopicService = app.get(AiTopicService);
    topicsService = app.get(TopicsService);
    topicGenerationLockService = app.get(TopicGenerationLockService);
    topicRepository = app.get(TOPIC_REPOSITORY);
    getPublicModelResponseSpy = vi
      .spyOn(aiTopicService, "getPublicModelResponse")
      .mockRejectedValue(new Error("Unexpected public model call"));
    getUserModelResponseSpy = vi
      .spyOn(aiTopicService, "getUserModelResponse")
      .mockRejectedValue(new Error("Unexpected user model call"));
  });

  afterEach(async () => {
    await clearDatabase();
    vi.mocked(verifyToken).mockReset();
    getPublicModelResponseSpy
      .mockReset()
      .mockRejectedValue(new Error("Unexpected public model call"));
    getUserModelResponseSpy
      .mockReset()
      .mockRejectedValue(new Error("Unexpected user model call"));
  });

  afterAll(async () => {
    await app?.close();
    await mongoServer?.stop();
  });

  it("generates UTC day keys", () => {
    expect(getUtcDayKey(new Date("2024-03-01T23:30:00.000Z"))).toBe(
      "2024-03-01"
    );
  });

  it("enforces unique topic ids at the database layer", async () => {
    await mongoClient()
      .db("topics")
      .collection("topic")
      .insertOne(buildPublicTopic("2024-04-01", "shared-topic-id"));

    await expect(
      mongoClient()
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

    await mongoClient()
      .db("topics")
      .collection("topic")
      .insertOne(existingTopic);

    await expect(
      topicsService.getOrCreatePublicTopicForDay(dayKey)
    ).resolves.toMatchObject({
      id: "existing-public",
      concept: "Concept existing-public",
      dayKey,
      public: true,
    });

    expect(aiTopicService.getPublicModelResponse).not.toHaveBeenCalled();

    const persistedCount = await mongoClient()
      .db("topics")
      .collection("topic")
      .countDocuments({ public: true, dayKey });

    expect(persistedCount).toBe(1);
  });

  it("prevents concurrent public generation from calling the model twice", async () => {
    const dayKey = "2024-03-02";
    const lockId = `topic-generation:public:${dayKey}`;
    const deferred = createDeferred<string>();

    getPublicModelResponseSpy.mockReturnValue(deferred.promise);

    const firstRequest = topicsService.getOrCreatePublicTopicForDay(dayKey);
    await waitForLock(lockId);

    await expect(
      topicsService.getOrCreatePublicTopicForDay(dayKey)
    ).rejects.toBeInstanceOf(TopicGenerationInProgressError);

    deferred.resolve(topicJson("Public Locking"));

    await expect(firstRequest).resolves.toMatchObject({
      concept: "Public Locking",
      dayKey,
      public: true,
    });

    expect(aiTopicService.getPublicModelResponse).toHaveBeenCalledTimes(1);

    const persistedCount = await mongoClient()
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

    getUserModelResponseSpy.mockReturnValue(deferred.promise);

    const firstRequest = topicsService.getOrCreateUserTopicForDay(
      userModelData,
      userId,
      dayKey
    );
    await waitForLock(lockId);

    await expect(
      topicsService.getOrCreateUserTopicForDay(userModelData, userId, dayKey)
    ).rejects.toBeInstanceOf(TopicGenerationInProgressError);

    deferred.resolve(topicJson("User Locking"));

    await expect(firstRequest).resolves.toMatchObject({
      concept: "User Locking",
      dayKey,
      public: false,
      userId,
    });

    expect(aiTopicService.getUserModelResponse).toHaveBeenCalledTimes(1);

    const persistedCount = await mongoClient()
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

    getUserModelResponseSpy.mockResolvedValue(topicJson("User Past Topic"));

    const topic = await topicsService.getOrCreateUserTopicForDay(
      userModelData,
      userId,
      dayKey
    );

    const user = await mongoClient().db("users").collection("user").findOne({
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

    getUserModelResponseSpy.mockResolvedValue(topicJson("Independent User"));

    await expect(
      Promise.all([
        topicsService.getOrCreateUserTopicForDay(
          userModelData,
          "user-1",
          dayKey
        ),
        topicsService.getOrCreateUserTopicForDay(
          userModelData,
          "user-2",
          dayKey
        ),
      ])
    ).resolves.toHaveLength(2);

    expect(aiTopicService.getUserModelResponse).toHaveBeenCalledTimes(2);

    const persistedCount = await mongoClient()
      .db("topics")
      .collection("topic")
      .countDocuments({ public: false, dayKey });

    expect(persistedCount).toBe(2);
  });

  it("returns in-progress while an active lock exists", async () => {
    const dayKey = "2024-03-05";

    await topicGenerationLockService.withLock(
      { scope: "public", dayKey },
      async () => {
        await expect(
          topicsService.getOrCreatePublicTopicForDay(dayKey)
        ).rejects.toBeInstanceOf(TopicGenerationInProgressError);
      }
    );

    expect(aiTopicService.getPublicModelResponse).not.toHaveBeenCalled();
  });

  it("allows an expired lock to be acquired", async () => {
    const dayKey = "2024-03-06";
    const now = new Date();

    await mongoClient()
      .db("topics")
      .collection("topicGenerationLocks")
      .insertOne({
        _id: `topic-generation:public:${dayKey}`,
        ownerId: "old-owner",
        scope: "public",
        dayKey,
        expiresAt: new Date(now.getTime() - 1000),
        createdAt: new Date(now.getTime() - 2000),
        updatedAt: new Date(now.getTime() - 2000),
      });

    getPublicModelResponseSpy.mockResolvedValue(topicJson("Expired Lock"));

    await expect(
      topicsService.getOrCreatePublicTopicForDay(dayKey)
    ).resolves.toMatchObject({
      concept: "Expired Lock",
      dayKey,
    });

    expect(aiTopicService.getPublicModelResponse).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed public model JSON before inserting a topic", async () => {
    const dayKey = "2024-03-08";

    getPublicModelResponseSpy.mockResolvedValue("{not-json");

    await expect(
      topicsService.getOrCreatePublicTopicForDay(dayKey)
    ).rejects.toBeInstanceOf(InvalidModelTopicResponseError);

    const persistedCount = await mongoClient()
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

    getUserModelResponseSpy.mockResolvedValue(
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
      topicsService.getOrCreateUserTopicForDay(userModelData, userId, dayKey)
    ).rejects.toBeInstanceOf(InvalidModelTopicResponseError);

    const persistedCount = await mongoClient()
      .db("topics")
      .collection("topic")
      .countDocuments({ public: false, userId, dayKey });

    expect(persistedCount).toBe(0);
  });

  it("returns the persisted winner when a duplicate insert races", async () => {
    const dayKey = "2024-03-07";
    const winner = buildPublicTopic(dayKey, "winner");
    const duplicate = buildPublicTopic(dayKey, "duplicate");

    await mongoClient().db("topics").collection("topic").insertOne(winner);

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
    const dayKey = getUtcDayKey();
    const lockId = `topic-generation:public:${dayKey}`;
    const deferred = createDeferred<string>();

    getPublicModelResponseSpy.mockReturnValue(deferred.promise);

    const firstRequest = topicsService.requestAndSaveNewPublicTopic();
    await waitForLock(lockId);

    await expect(
      topicsService.requestAndSaveNewPublicTopic()
    ).rejects.toBeInstanceOf(TopicGenerationInProgressError);

    deferred.resolve(topicJson("Scheduled Public"));

    await expect(firstRequest).resolves.toMatchObject({
      concept: "Scheduled Public",
      dayKey,
    });

    const persistedTopic = await mongoClient()
      .db("topics")
      .collection("topic")
      .findOne({ public: true, dayKey });

    expect(persistedTopic).toMatchObject({
      concept: "Scheduled Public",
      dayKey,
    });
    expect(aiTopicService.getPublicModelResponse).toHaveBeenCalledTimes(1);
  });

  it("creates a profile and rejects concurrent duplicate profile creation", async () => {
    mockVerifiedTokenSubject("profile-user");

    const profile = {
      csLevel: "beginner",
      goals: "learn TypeScript",
      preferences: "short examples",
      topicsToAvoid: "assembly",
    };

    const [firstResponse, secondResponse] = await Promise.all([
      request(app.getHttpServer())
        .post("/api/v1/me/profile")
        .set("Authorization", auth())
        .send(profile),
      request(app.getHttpServer())
        .post("/api/v1/me/profile")
        .set("Authorization", auth())
        .send(profile),
    ]);

    expect([firstResponse.status, secondResponse.status].sort()).toEqual([
      201, 409,
    ]);
    expect([firstResponse.body, secondResponse.body]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: "profile-user", ...profile }),
        expect.objectContaining({
          statusCode: 409,
          message: "User already exists.",
          code: "USER_ALREADY_EXISTS",
        }),
      ])
    );

    const persistedCount = await mongoClient()
      .db("users")
      .collection("user")
      .countDocuments({ userId: "profile-user" });

    expect(persistedCount).toBe(1);
  });

  it("derives profile ownership from the verified token instead of request body", async () => {
    mockVerifiedTokenSubject("authenticated-user");

    const response = await request(app.getHttpServer())
      .post("/api/v1/me/profile")
      .set("Authorization", auth())
      .send({
        userId: "different-user",
        csLevel: "beginner",
        goals: "learn TypeScript",
        preferences: "short examples",
        topicsToAvoid: "assembly",
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      userId: "authenticated-user",
      csLevel: "beginner",
      goals: "learn TypeScript",
      preferences: "short examples",
      topicsToAvoid: "assembly",
    });

    const persistedCount = await mongoClient()
      .db("users")
      .collection("user")
      .countDocuments({ userId: "different-user" });

    expect(persistedCount).toBe(0);
  });

  it("edits an authenticated profile without clearing quiz history", async () => {
    const userId = "profile-user";

    await mongoClient().db("users").collection("user").insertOne({
      userId,
      csLevel: "beginner",
      goals: "learn TypeScript",
      preferences: "short examples",
      topicsToAvoid: "assembly",
      answeredQuizzes: [{ id: "quiz-1", correctness: true }],
    });

    mockVerifiedTokenSubject(userId);

    const response = await request(app.getHttpServer())
      .patch("/api/v1/me/profile")
      .set("Authorization", auth())
      .send({
        csLevel: "advanced",
        goals: "design distributed systems",
        preferences: "deep dives",
        topicsToAvoid: "CSS",
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      userId,
      csLevel: "advanced",
      goals: "design distributed systems",
      preferences: "deep dives",
      topicsToAvoid: "CSS",
      answeredQuizzes: [{ id: "quiz-1", correctness: true }],
    });
  });

  it("rejects protected requests when the bearer token is missing", async () => {
    const response = await request(app.getHttpServer()).get(
      "/api/v1/me/profile/status"
    );

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      statusCode: 401,
      message: "Token not found. User must sign in.",
      code: "AUTH_TOKEN_MISSING",
    });
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it("passes protected requests after Clerk verifies the bearer token", async () => {
    mockVerifiedTokenSubject("profile-user");

    const response = await request(app.getHttpServer())
      .get("/api/v1/me/profile/status")
      .set("Authorization", auth());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ exists: false });
    expect(verifyToken).toHaveBeenCalledWith(
      "valid-token",
      expect.objectContaining({
        jwtKey: TEST_CLERK_JWT_KEY,
        authorizedParties: expect.arrayContaining([
          "http://localhost:3000",
          "https://www.learninfive.com",
          "https://learninfive.com",
        ]),
      })
    );
  });

  it("rejects protected requests when Clerk cannot verify the bearer token", async () => {
    vi.mocked(verifyToken).mockRejectedValue(new Error("invalid token"));

    const response = await request(app.getHttpServer())
      .get("/api/v1/me/profile/status")
      .set("Authorization", auth("invalid-token"));

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      statusCode: 401,
      message: "Token not verified.",
      code: "AUTH_TOKEN_INVALID",
    });
  });

  it("persists authenticated quiz answers and replays them with the daily topic", async () => {
    const userId = "quiz-user";
    const dayKey = getUtcDayKey();
    const topic = buildUserTopic(dayKey, userId);

    await mongoClient().db("users").collection("user").insertOne({
      userId,
      csLevel: "beginner",
      goals: "learn TypeScript",
      preferences: "short examples",
    });
    await mongoClient().db("topics").collection("topic").insertOne(topic);

    mockVerifiedTokenSubject(userId);

    const answerResponse = await request(app.getHttpServer())
      .post(`/api/v1/topics/${topic.id}/answers`)
      .set("Authorization", auth())
      .send({ answerId: "answer-1" });

    expect(answerResponse.status).toBe(200);
    expect(answerResponse.body).toEqual({ correct: true });

    const persistedUser = await mongoClient()
      .db("users")
      .collection("user")
      .findOne({
        userId,
      });

    expect(persistedUser?.answeredQuizzes).toEqual([
      { id: "quiz-1", correctness: true },
    ]);

    const topicResponse = await request(app.getHttpServer())
      .get("/api/v1/me/topics/today")
      .set("Authorization", auth());

    expect(topicResponse.status).toBe(200);
    expect(topicResponse.body).toMatchObject({
      id: topic.id,
      quiz: expect.objectContaining({
        id: "quiz-1",
        userAnswer: true,
      }),
    });
  });

  it("answers anonymous quizzes for public topics", async () => {
    const dayKey = getUtcDayKey();
    const topic = {
      ...buildPublicTopic(dayKey, "00000000-0000-4000-8000-000000000002"),
      id: "00000000-0000-4000-8000-000000000002",
    };

    await mongoClient().db("topics").collection("topic").insertOne(topic);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/topics/${topic.id}/answers`)
      .send({ answerId: "answer-1" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ correct: true });
  });

  it("does not let anonymous users answer private user topics", async () => {
    const dayKey = getUtcDayKey();
    const topic = buildUserTopic(dayKey, "private-user");

    await mongoClient().db("topics").collection("topic").insertOne(topic);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/topics/${topic.id}/answers`)
      .send({ answerId: "answer-1" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      statusCode: 404,
      message: "Topic not found",
      code: "TOPIC_NOT_FOUND",
    });
  });

  it("validates the new quiz answer route contract", async () => {
    const invalidTopicResponse = await request(app.getHttpServer())
      .post("/api/v1/topics/not-a-uuid/answers")
      .send({ answerId: "answer-1" });

    expect(invalidTopicResponse.status).toBe(400);

    const missingAnswerResponse = await request(app.getHttpServer())
      .post("/api/v1/topics/00000000-0000-4000-8000-000000000001/answers")
      .send({});

    expect(missingAnswerResponse.status).toBe(400);
  });

  it("returns direct topic DTOs without the old success/content envelope", async () => {
    const dayKey = getUtcDayKey();
    const topic = buildPublicTopic(dayKey, "00000000-0000-4000-8000-000000000003");

    await mongoClient().db("topics").collection("topic").insertOne(topic);

    const response = await request(app.getHttpServer()).get(
      "/api/v1/topics/today"
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: topic.id,
      dayKey,
      public: true,
    });
    expect(response.body).not.toHaveProperty("success");
    expect(response.body).not.toHaveProperty("content");
  });

  it("does not expose the legacy Express route", async () => {
    const response = await request(app.getHttpServer()).get(
      "/topics/get-topic"
    );

    expect(response.status).toBe(404);
  });
});
