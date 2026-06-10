import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ClerkAuthGuard } from "../auth/guards/clerk-auth.guard";
import { ProfileDto } from "./dto/profile.dto";
import { UsersService } from "./users.service";

@Controller("me/profile")
@UseGuards(ClerkAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("status")
  getProfileStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getProfileStatus(user.userId);
  }

  @Get()
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getProfile(user.userId);
  }

  @Post()
  createProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ProfileDto
  ) {
    return this.usersService.createProfile(user.userId, body);
  }

  @Patch()
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ProfileDto
  ) {
    return this.usersService.updateProfile(user.userId, body);
  }
}
