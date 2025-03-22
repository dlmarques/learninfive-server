export interface User {
  userId: string;
  csLevel: string;
  goals: string;
  preferences: string;
  topicsToAvoid?: string;
  pastTopics?: PastTopic[];
  answeredQuizzes?: AnsweredQuiz[];
}

interface PastTopic {
  id: string;
  concept: string;
}

interface AnsweredQuiz {
  id: string;
  correctness: boolean;
}
