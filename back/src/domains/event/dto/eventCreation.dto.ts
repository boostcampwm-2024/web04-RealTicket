import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsNotEmpty } from 'class-validator';

export class EventCreationDto {
  @ApiProperty({ description: '이벤트 시작 시간', type: 'string', format: 'date-time', example: '2024-11-18T01:00:00Z' })
  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  runningDate: Date;

  @ApiProperty({ description: '이벤트 예매 오픈 시간', type: 'string', format: 'date-time', example: '2024-11-16T01:00:00Z' })
  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  reservationOpenDate: Date;

  @ApiProperty({ description: '이벤트 예매 마감 시간', type: 'string', format: 'date-time', example: '2024-11-17T01:00:00Z' })
  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  reservationCloseDate: Date;

  @ApiProperty({ description: '프로그램 아이디', type: 'number', example: 1 })
  @IsNotEmpty()
  @IsInt()
  programId: number;
}
