import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { TopicsService } from "../topics/topics.service";

@Injectable()
export class TopicSchedulerService {
  constructor(
    private readonly configService: ConfigService,
    private readonly topicsService: TopicsService
  ) {}

  @Cron("0 0 * * *", { timeZone: "UTC" })
  async generatePublicTopic() {
    if (this.configService.get<string>("NODE_ENV") === "test") {
      return;
    }

    try {
      await this.topicsService.requestAndSaveNewPublicTopic();
    } catch (error) {
      console.error(error);
    }
  }
}
