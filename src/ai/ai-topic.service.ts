import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import type { UserDataToModel } from "../domain/model";

@Injectable()
export class AiTopicService {
  private readonly openai: OpenAI;

  constructor(configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: configService.get<string>("OPEN_AI_API_KEY") ?? "missing-api-key",
    });
  }

  async getPublicModelResponse(previousTopics?: string[]) {
    let refinedPrompt: string;

    if (previousTopics && previousTopics.length > 0) {
      const joinedPreviousTopics = previousTopics.join(", ");
      refinedPrompt = `Explain a programming/computer science concept that has not been previously provided, and make sure it logically follows from the previous concepts. The concept should build upon the understanding of the prior topics in increasing complexity. Previously provided concepts: ${joinedPreviousTopics}. Return only a valid JSON object with the following structure: { 'concept': '', 'definition': '', 'realWorldAnalogy': '', 'examples': [{ 'language': '', 'code': '' }], 'quiz': {'question': '', 'answers': [{'id': '', 'content': ''}], 'rightAnswer': '' } }, the entire explanation must be between 4 and 5 minutes read, and you have to provide examples in following languages: JavaScript, Python, Java, C#, C++, TypeScript, PHP. Do not include any additional text before or after the JSON. The concept should be unique and not in the previously provided list. Ensure that the new concept is a logical continuation of the previous concepts, gradually increasing in complexity.`;
    } else {
      refinedPrompt =
        "Explain a programming/computer science concept. Return only a valid JSON object with the following structure: { 'concept': '', 'definition': '', 'realWorldAnalogy': '', 'examples': [{ 'language': '', 'code': '' }], 'quiz': {'question': '', 'answers': [{'id': '', 'content': ''}], rightAnswerId: '' } }, the entire explanation cannot exceed 5 minutes read. Do not include any additional text before or after the JSON. The concept should be unique and not in the previously provided list.";
    }

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      store: true,
      messages: [{ role: "user", content: refinedPrompt }],
    });

    return cleanJsonResponse(completion.choices[0].message.content || "");
  }

  async getUserModelResponse(userDataToModel: UserDataToModel) {
    const { pastTopics, csLevel, preferences, goals, topicsToAvoid } =
      userDataToModel;
    let refinedPrompt: string;

    if (pastTopics) {
      refinedPrompt = `Explain a programming/computer science concept that has not been previously provided, and ensure it logically follows from the previous topics based on the user's level (${csLevel}) and goals (${goals}). The concept should build upon the understanding of prior topics in increasing complexity, and align with the user's preferences and skills (${preferences}). Avoid topics that the user has already encountered (${pastTopics})${
        topicsToAvoid
          ? ` or has expressed interest in avoiding (${topicsToAvoid})`
          : ""
      }. The new concept should increase in difficulty from the previous topics, offering a natural progression. Return only a valid JSON object with the following structure: { 'concept': '', 'definition': '', 'realWorldAnalogy': '', 'examples': [{ 'language': '', 'code': '' }], 'quiz': {'question': '', 'answers': [{'id': '', 'content': ''}], 'rightAnswer': '' } }. The explanation must be between 4 and 5 minutes read, and you must provide examples in the following languages: JavaScript, Python, Java, C#, C++, TypeScript, PHP. Do not include any additional text before or after the JSON. Ensure the new concept is a logical continuation of the user's journey, building progressively from easy to hard.`;
    } else {
      refinedPrompt = `Explain a programming/computer science concept based on the user's level (${csLevel}), preferences (${preferences}), and goals (${goals}).${
        topicsToAvoid
          ? ` Avoid topics that the user has expressed an interest in avoiding (${topicsToAvoid})`
          : ""
      }. Return only a valid JSON object with the following structure: { 'concept': '', 'definition': '', 'realWorldAnalogy': '', 'examples': [{ 'language': '', 'code': '' }], 'quiz': {'question': '', 'answers': [{'id': '', 'content': ''}], 'rightAnswer': '' } }. The explanation cannot exceed 5 minutes read. Do not include any additional text before or after the JSON. Ensure that the new concept is unique, builds progressively in difficulty, and is tailored to the user's learning path.`;
    }

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      store: true,
      messages: [{ role: "user", content: refinedPrompt }],
    });

    return cleanJsonResponse(completion.choices[0].message.content || "");
  }
}

const cleanJsonResponse = (response: string): string => {
  const jsonMatch = response.match(/```json\r?\n?([\s\S]*?)\r?\n?```/);

  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  return response.trim();
};
