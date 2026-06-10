import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { ClerkAuthGuard } from "./guards/clerk-auth.guard";
import { OptionalClerkAuthGuard } from "./guards/optional-clerk-auth.guard";

@Module({
  providers: [AuthService, ClerkAuthGuard, OptionalClerkAuthGuard],
  exports: [AuthService, ClerkAuthGuard, OptionalClerkAuthGuard],
})
export class AuthModule {}
