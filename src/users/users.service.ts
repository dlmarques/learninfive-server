import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { User, UserProfileInput } from "../domain/user";
import { DuplicateEntityError } from "../persistence/repositories/persistence.errors";
import { USER_REPOSITORY } from "../persistence/repositories/repository.tokens";
import type { UserRepository } from "../persistence/repositories/user.repository";

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository
  ) {}

  async getProfileStatus(userId: string) {
    return {
      exists: await this.userRepository.exists(userId),
    };
  }

  async getProfile(userId: string) {
    const user = await this.userRepository.findByUserId(userId);

    if (!user) {
      throw userNotFoundException();
    }

    return user;
  }

  async createProfile(userId: string, profile: UserProfileInput) {
    if (await this.userRepository.exists(userId)) {
      throw userAlreadyExistsException();
    }

    const user: User = {
      userId,
      ...profile,
    };

    try {
      return await this.userRepository.create(user);
    } catch (error) {
      if (error instanceof DuplicateEntityError) {
        throw userAlreadyExistsException();
      }

      throw error;
    }
  }

  async updateProfile(userId: string, profile: UserProfileInput) {
    const updated = await this.userRepository.updateProfile(userId, profile);

    if (!updated) {
      throw userNotFoundException();
    }

    return this.getProfile(userId);
  }
}

const userNotFoundException = () =>
  new NotFoundException({
    message: "User not found",
    code: "USER_NOT_FOUND",
  });

const userAlreadyExistsException = () =>
  new ConflictException({
    message: "User already exists.",
    code: "USER_ALREADY_EXISTS",
  });
