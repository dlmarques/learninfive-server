import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ClerkAuthGuard } from "../auth/guards/clerk-auth.guard";
import { TopicsService } from "./topics.service";

@Controller("me/topics")
@UseGuards(ClerkAuthGuard)
export class MeTopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  @Get("today")
  getUserTopicForToday(@CurrentUser() user: AuthenticatedUser) {
    return this.topicsService.getUserTopicForToday(user.userId);
  }
}
