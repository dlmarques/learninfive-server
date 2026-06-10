import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { TopicsModule } from "../topics/topics.module";
import { TopicSchedulerService } from "./topic-scheduler.service";

@Module({
  imports: [ScheduleModule.forRoot(), TopicsModule],
  providers: [TopicSchedulerService],
})
export class SchedulingModule {}
