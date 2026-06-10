import { Module } from "@nestjs/common";
import { MongoDatabaseService } from "./mongo/mongo-database.service";
import { MongoStorageService } from "./mongo/mongo-storage.service";
import { MongoTopicGenerationLockRepository } from "./mongo/mongo-topic-generation-lock.repository";
import { MongoTopicRepository } from "./mongo/mongo-topic.repository";
import { MongoUserRepository } from "./mongo/mongo-user.repository";
import {
  TOPIC_GENERATION_LOCK_REPOSITORY,
  TOPIC_REPOSITORY,
  USER_REPOSITORY,
} from "./repositories/repository.tokens";

@Module({
  providers: [
    MongoDatabaseService,
    MongoStorageService,
    {
      provide: TOPIC_REPOSITORY,
      useClass: MongoTopicRepository,
    },
    {
      provide: USER_REPOSITORY,
      useClass: MongoUserRepository,
    },
    {
      provide: TOPIC_GENERATION_LOCK_REPOSITORY,
      useClass: MongoTopicGenerationLockRepository,
    },
  ],
  exports: [
    MongoDatabaseService,
    MongoStorageService,
    TOPIC_REPOSITORY,
    USER_REPOSITORY,
    TOPIC_GENERATION_LOCK_REPOSITORY,
  ],
})
export class PersistenceModule {}
