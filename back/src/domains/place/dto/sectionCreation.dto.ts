import { ArrayNotEmpty, IsArray, IsBoolean, IsEmpty, IsInt, IsNotEmpty, IsString } from 'class-validator';

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
  seats: boolean[];

  @IsNotEmpty()
  @IsEmpty()
  placeId: number;
}
