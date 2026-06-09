export interface ParsedModelTopicResponse {
  concept: string;
  definition: string;
  realWorldAnalogy: string;
  examples: ParsedModelTopicExample[];
  quiz: ParsedModelTopicQuiz;
}

interface ParsedModelTopicExample {
  language: string;
  code: string;
}

interface ParsedModelTopicQuiz {
  question: string;
  answers: ParsedModelTopicQuizAnswer[];
  rightAnswer: string;
}

interface ParsedModelTopicQuizAnswer {
  id: string;
  content: string;
}

export class InvalidModelTopicResponseError extends Error {
  constructor(reason: string) {
    super(`Invalid model topic response: ${reason}`);
    this.name = "InvalidModelTopicResponseError";
    Object.setPrototypeOf(this, InvalidModelTopicResponseError.prototype);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const validateRecord = (
  value: unknown,
  path: string
): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new InvalidModelTopicResponseError(`${path} must be an object`);
  }

  return value;
};

const validateString = (value: unknown, path: string) => {
  if (typeof value !== "string") {
    throw new InvalidModelTopicResponseError(`${path} must be a string`);
  }

  return value;
};

const validateArray = (value: unknown, path: string) => {
  if (!Array.isArray(value)) {
    throw new InvalidModelTopicResponseError(`${path} must be an array`);
  }

  return value;
};

const validateExamples = (value: unknown) => {
  return validateArray(value, "examples").map((example, index) => {
    const exampleRecord = validateRecord(example, `examples[${index}]`);

    return {
      language: validateString(
        exampleRecord.language,
        `examples[${index}].language`
      ),
      code: validateString(exampleRecord.code, `examples[${index}].code`),
    };
  });
};

const validateAnswers = (value: unknown) => {
  return validateArray(value, "quiz.answers").map((answer, index) => {
    const answerRecord = validateRecord(answer, `quiz.answers[${index}]`);

    return {
      id: validateString(answerRecord.id, `quiz.answers[${index}].id`),
      content: validateString(
        answerRecord.content,
        `quiz.answers[${index}].content`
      ),
    };
  });
};

const validateQuiz = (value: unknown) => {
  const quiz = validateRecord(value, "quiz");

  return {
    question: validateString(quiz.question, "quiz.question"),
    answers: validateAnswers(quiz.answers),
    rightAnswer: validateString(quiz.rightAnswer, "quiz.rightAnswer"),
  };
};

export const parseModelTopicResponse = (
  response: string
): ParsedModelTopicResponse => {
  let parsedResponse: unknown;

  try {
    parsedResponse = JSON.parse(response);
  } catch {
    throw new InvalidModelTopicResponseError("response must be valid JSON");
  }

  const responseRecord = validateRecord(parsedResponse, "response");

  return {
    concept: validateString(responseRecord.concept, "concept"),
    definition: validateString(responseRecord.definition, "definition"),
    realWorldAnalogy: validateString(
      responseRecord.realWorldAnalogy,
      "realWorldAnalogy"
    ),
    examples: validateExamples(responseRecord.examples),
    quiz: validateQuiz(responseRecord.quiz),
  };
};
