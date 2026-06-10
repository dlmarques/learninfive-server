export interface Topic {
  id: string;
  concept: string;
  definition: string;
  realWorldAnalogy: string;
  examples: TopicExample[];
  quiz: TopicQuiz;
  date: Date;
  dayKey: string;
  public: boolean;
  userId?: string;
}

export interface TopicExample {
  language: string;
  code: string;
}

export interface TopicQuiz {
  id: string;
  question: string;
  answers: TopicQuizAnswer[];
  rightAnswer: string;
  userAnswer?: boolean;
}

export interface TopicQuizAnswer {
  id: string;
  content: string;
}

export interface InsertTopicResult {
  inserted: boolean;
  topic: Topic;
}
