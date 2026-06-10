import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Collection,
  MongoClient,
  ServerApiVersion,
  type Document,
} from "mongodb";

@Injectable()
export class MongoDatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly client: MongoClient;

  constructor(configService: ConfigService) {
    const uri = configService.get<string>("MONGO_DB_URI");

    if (!uri) {
      throw new Error("MONGO_DB_URI is required");
    }

    this.client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      maxPoolSize: 10,
      minPoolSize: 5,
      maxIdleTimeMS: 60000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
  }

  async onModuleInit() {
    await this.client.connect();
    await this.client.db("admin").command({ ping: 1 });
  }

  async onModuleDestroy() {
    await this.client.close();
  }

  getClient() {
    return this.client;
  }

  getCollection<T extends Document>(databaseName: string, collection: string) {
    return this.client.db(databaseName).collection<T>(collection);
  }
}
