import type { Topic } from "../../domain/topic";
import type { User, UserProfileInput } from "../../domain/user";

export interface UserRepository {
  findByUserId(userId: string): Promise<User | null>;
  exists(userId: string): Promise<boolean>;
  create(user: User): Promise<User>;
  updateProfile(userId: string, profile: UserProfileInput): Promise<boolean>;
  appendPastTopic(userId: string, topic: Topic): Promise<boolean>;
  appendAnsweredQuiz(
    userId: string,
    quizId: string,
    correctness: boolean
  ): Promise<boolean>;
}
