export interface Topic {
  id: string;
  concept: string;
  definition: string;
  realWorldAnalogy: string;
  examples: TopicExample[];
  quiz: TopicQuiz;
  date: Date;
  public: boolean;
  userId?: string;
}

interface TopicExample {
  language: string;
  code: string;
}

interface TopicQuiz {
  id: string;
  question: string;
  answers: TopicQuizAnswers[];
  rightAnswer: string;
}

interface TopicQuizAnswers {
  id: string;
  content: string;
}
