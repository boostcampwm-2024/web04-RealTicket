import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class ProgramCreationDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  profileUrl: string;

  @IsNotEmpty()
  @IsInt()
  runningTime: number;

  @IsNotEmpty()
  @IsString()
  genre: string;

  @IsNotEmpty()
  @IsString()
  actors: string;

  @IsNotEmpty()
  @IsInt()
  price: number;

  @IsNotEmpty()
  @IsInt()
  placeId: number;
}
