export interface User {
  userId: string;
  csLevel: string;
  goals: string;
  preferences: string;
  topicsToAvoid?: string;
  pastTopics?: PastTopic[];
  answeredQuizzes?: AnsweredQuiz[];
}

export interface PastTopic {
  id: string;
  concept: string;
}

export interface AnsweredQuiz {
  id: string;
  correctness: boolean;
}

export interface UserProfileInput {
  csLevel: string;
  goals: string;
  preferences: string;
  topicsToAvoid?: string;
}
