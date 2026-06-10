import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AuthModule } from "../auth/auth.module";
import { PersistenceModule } from "../persistence/persistence.module";
import { MeTopicsController } from "./me-topics.controller";
import { TopicGenerationLockService } from "./topic-generation-lock.service";
import { TopicsController } from "./topics.controller";
import { TopicsService } from "./topics.service";

@Module({
  imports: [AiModule, AuthModule, PersistenceModule],
  controllers: [TopicsController, MeTopicsController],
  providers: [TopicsService, TopicGenerationLockService],
  exports: [TopicsService, TopicGenerationLockService],
})
export class TopicsModule {}
