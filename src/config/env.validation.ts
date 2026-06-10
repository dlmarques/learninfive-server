const DEFAULT_CORS_ORIGINS = [
  "http://localhost:3000",
  "https://learninfive.dev",
  "https://www.learninfive.dev",
  "https://learninfive.com",
  "https://www.learninfive.com",
];

const DEFAULT_LOCK_TTL_MS = 2 * 60 * 1000;

const parsePort = (value: string | undefined) => {
  const port = Number(value ?? 8000);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer");
  }

  return port;
};

const parsePositiveNumber = (
  value: string | undefined,
  fallback: number,
  envName: string
) => {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error(`${envName} must be a positive number`);
  }

  return parsedValue;
};

const parseCorsOrigins = (value: string | undefined) => {
  if (!value) {
    return DEFAULT_CORS_ORIGINS;
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const buildMongoUri = (config: Record<string, string | undefined>) => {
  if (config.MONGO_DB_URI) {
    return config.MONGO_DB_URI;
  }

  if (config.MONGO_DB_USER && config.MONGO_DB_PASSWORD) {
    return `mongodb+srv://${config.MONGO_DB_USER}:${config.MONGO_DB_PASSWORD}@cluster0.sefgk.mongodb.net/topics?retryWrites=true&w=majority&appName=Cluster0`;
  }

  if (config.NODE_ENV === "test") {
    return "";
  }

  throw new Error("MONGO_DB_URI or MONGO_DB_USER/MONGO_DB_PASSWORD is required");
};

export const validateEnv = (config: Record<string, string | undefined>) => {
  const nodeEnv = config.NODE_ENV ?? "development";
  const mongoUri = buildMongoUri(config);

  if (nodeEnv === "production" && !config.CLERK_JWT_KEY) {
    throw new Error("CLERK_JWT_KEY is required in production");
  }

  if (nodeEnv === "production" && !config.OPEN_AI_API_KEY) {
    throw new Error("OPEN_AI_API_KEY is required in production");
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    PORT: parsePort(config.PORT),
    MONGO_DB_URI: mongoUri,
    CORS_ORIGINS: parseCorsOrigins(config.CORS_ORIGINS),
    TOPIC_GENERATION_LOCK_TTL_MS: parsePositiveNumber(
      config.TOPIC_GENERATION_LOCK_TTL_MS,
      DEFAULT_LOCK_TTL_MS,
      "TOPIC_GENERATION_LOCK_TTL_MS"
    ),
  };
};
