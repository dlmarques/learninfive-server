import { Module } from "@nestjs/common";
import { AiTopicService } from "./ai-topic.service";

@Module({
  providers: [AiTopicService],
  exports: [AiTopicService],
})
export class AiModule {}
