import { ApiProperty } from '@nestjs/swagger';
import { IsJSON, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class PlaceCreationDto {
  @ApiProperty({ description: '장소 이름', example: '대극장' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ description: '장소 주소', example: '서울특별시' })
  @IsNotEmpty()
  @IsString()
  address: string;

  @ApiProperty({ description: 'overview SVG URL', example: '/overview.svg' })
  @IsNotEmpty()
  @IsString()
  overviewSvg: string;

  @ApiProperty({ description: '오버뷰 높이', example: 1000 })
  @IsNotEmpty()
  @IsNumber()
  overviewHeight: number;

  @ApiProperty({ description: '오버뷰 너비', example: 1500 })
  @IsNotEmpty()
  @IsNumber()
  overviewWidth: number;

  @ApiProperty({ description: '오버뷰 좌표', example: '{"x":200,"y":300}' })
  @IsNotEmpty()
  @IsJSON()
  overviewPoints: JSON;
}
