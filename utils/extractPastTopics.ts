import { User } from "../types/User";

export const extractPastTopics = (userData: User) => {
  const pastConceptTopics = userData.pastTopics?.map((topic) => {
    return topic.concept;
  });

  if (pastConceptTopics?.length === 0) return null;

  const joinedPastTopics = pastConceptTopics?.join(", ");

  return joinedPastTopics || null;
};
