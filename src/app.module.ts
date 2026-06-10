import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AiModule } from "./ai/ai.module";
import { AuthModule } from "./auth/auth.module";
import { validateEnv } from "./config/env.validation";
import { getRuntimeEnv } from "./config/runtime-env";
import { PersistenceModule } from "./persistence/persistence.module";
import { SchedulingModule } from "./scheduling/scheduling.module";
import { TopicsModule } from "./topics/topics.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: getRuntimeEnv("NODE_ENV") === "test",
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 15 * 60 * 1000,
        limit: 50,
      },
    ]),
    AiModule,
    AuthModule,
    PersistenceModule,
    TopicsModule,
    UsersModule,
    SchedulingModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
