import { IsString } from "class-validator";

export class AnswerQuizDto {
  @IsString()
  answerId!: string;
}

export interface QuizAnswerResultDto {
  correct: boolean;
}
