import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class SectionSwitchReqDto {
  @IsInt()
  @Min(0)
  @ApiProperty({ name: 'sectionIndex', example: 1, description: '전환할 섹션 인덱스 (0부터 시작)' })
  sectionIndex: number;
}
