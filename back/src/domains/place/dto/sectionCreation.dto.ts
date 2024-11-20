import { ArrayNotEmpty, IsArray, IsBoolean, IsInt, IsNotEmpty, IsString } from 'class-validator';

export class SectionCreationDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsInt()
  colLen: number;

  @IsNotEmpty()
  @IsArray()
  @ArrayNotEmpty()
  @IsBoolean({ each: true })
  seats: string[];

  @IsNotEmpty()
  @IsInt()
  placeId: number;

  @IsNotEmpty()
  @IsInt()
  order: number;
}
