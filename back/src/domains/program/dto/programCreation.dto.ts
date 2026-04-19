import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class ProgramCreationDto {
  @ApiProperty({ description: '프로그램 이름', example: '맘마미아' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ description: '프로그램 사진 URL', example: '/profile.png' })
  @IsNotEmpty()
  @IsString()
  profileUrl: string;

  @ApiProperty({ description: '프로그램 진행 시간(초)', example: 10000 })
  @IsNotEmpty()
  @IsInt()
  runningTime: number;

  @ApiProperty({ description: '프로그램 장르', example: '뮤지컬' })
  @IsNotEmpty()
  @IsString()
  genre: string;

  @ApiProperty({ description: '출연진(들)', example: '김동현, 김동현' })
  @IsNotEmpty()
  @IsString()
  actors: string;

  @ApiProperty({ description: '입장권 가격', example: 15000 })
  @IsNotEmpty()
  @IsInt()
  price: number;

  @ApiProperty({ description: '장소 아이디', example: 1 })
  @IsNotEmpty()
  @IsInt()
  placeId: number;
}
