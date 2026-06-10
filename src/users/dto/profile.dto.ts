import { IsOptional, IsString } from "class-validator";

export class ProfileDto {
  @IsString()
  csLevel!: string;

  @IsString()
  goals!: string;

  @IsString()
  preferences!: string;

  @IsOptional()
  @IsString()
  topicsToAvoid?: string;
}

export interface ProfileStatusDto {
  exists: boolean;
}
