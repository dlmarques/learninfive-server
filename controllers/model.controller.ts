import OpenAI from "openai";
require("dotenv").config();

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_API_KEY,
});

export const getModelResponse = (previousTopics?: string[]) => {
  let refinedPrompt;

  if (previousTopics) {
    const joinedPreviousTopics = previousTopics.join(", ");
    refinedPrompt = `Explain a programming/computer science concept that has not been previously provided. Previously provided concepts: ${joinedPreviousTopics}. Return only a valid JSON object with the following structure: { 'concept': '', 'definition': '', 'realWorldAnalogy': '', 'examples': [{ 'language': '', 'code': '' }], 'quiz': {'question': '', 'answers': [{'id': '', 'content': ''}], rightAnswer: '' } }, the entire explanation must be between 4 and 5 minutes read. Do not include any additional text before or after the JSON. The concept should be unique and not in the previously provided list.`;
  } else {
    refinedPrompt =
      "Explain a programming/computer science concept. Return only a valid JSON object with the following structure: { 'concept': '', 'definition': '', 'realWorldAnalogy': '', 'examples': [{ 'language': '', 'code': '' }], 'quiz': {'question': '', 'answers': [{'id': '', 'content': ''}], rightAnswerId: '' } }, the entire explanation cannot exceed 5 minutes read. Do not include any additional text before or after the JSON. The concept should be unique and not in the previously provided list.";
  }

  try {
    const completion = openai.chat.completions.create({
      model: "gpt-4o-mini",
      store: true,
      messages: [{ role: "user", content: refinedPrompt }],
    });

    const response = completion.then((result) => {
      return result.choices[0].message.content;
    });
    return response;
  } catch (error) {
    console.error(error);
    return null;
  }
};
