import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { OptionalClerkAuthGuard } from "../auth/guards/optional-clerk-auth.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { AnswerQuizDto } from "./dto/answer-quiz.dto";
import { TopicsService } from "./topics.service";

@Controller("topics")
export class TopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  @Get("today")
  getPublicTopicForToday() {
    return this.topicsService.getPublicTopicForToday();
  }

  @Post(":topicId/answers")
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalClerkAuthGuard)
  answerQuiz(
    @Param("topicId", ParseUUIDPipe) topicId: string,
    @Body() body: AnswerQuizDto,
    @CurrentUser() user?: AuthenticatedUser
  ) {
    return this.topicsService.answerQuiz(topicId, body.answerId, user?.userId);
  }
}
