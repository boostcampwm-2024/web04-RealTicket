import { IsJSON, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class PlaceCreationDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  address: string;

  @IsNotEmpty()
  @IsString()
  overviewSvg: string;

  @IsNotEmpty()
  @IsNumber()
  overviewHeight: number;

  @IsNotEmpty()
  @IsNumber()
  overviewWidth: number;

  @IsNotEmpty()
  @IsJSON()
  overviewPoints: JSON;
}
