import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UserCreateDto {
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  @Matches(/^[a-z0-9]+$/)
  readonly loginId: string;

  @IsString()
  @MinLength(4)
  @MaxLength(12)
  @Matches(/^[a-z0-9]+$/)
  readonly loginPassword: string;
}
