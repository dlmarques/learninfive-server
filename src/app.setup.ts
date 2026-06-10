import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpAdapterHost } from "@nestjs/core";
import fastifyHelmet from "@fastify/helmet";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter";

export const configureApp = async (app: NestFastifyApplication) => {
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>("NODE_ENV") ?? "development";
  const corsOrigins = configService.get<string[]>("CORS_ORIGINS") ?? [];

  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    })
  );
  app.useGlobalFilters(new ApiExceptionFilter(app.get(HttpAdapterHost)));

  if (nodeEnv === "production") {
    await app.register(fastifyHelmet, {
      dnsPrefetchControl: { allow: false },
      xContentTypeOptions: true,
      frameguard: { action: "sameorigin" },
      hsts: {
        maxAge: 60 * 60 * 24 * 365,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: "no-referrer" },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "same-origin" },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: [
            "'self'",
            "https://learninfive.dev",
            "https://www.learninfive.dev",
            "https://learninfive.com",
            "https://www.learninfive.com",
            "http://localhost:3000",
          ],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          fontSrc: [
            "'self'",
            "https://fonts.googleapis.com",
            "https://fonts.gstatic.com",
          ],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
    });
  }
};
