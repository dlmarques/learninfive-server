export interface Topic {
  concept: string;
  definition: string;
  realWorldAnalogy: string;
  examples: TopicExample[];
  quiz: TopicQuiz;
  date: Date;
}

interface TopicExample {
  language: string;
  code: string;
}

interface TopicQuiz {
  question: string;
  answers: TopicQuizAnswers[];
  rightAnswerId: string;
}

interface TopicQuizAnswers {
  id: string;
  content: string;
}
