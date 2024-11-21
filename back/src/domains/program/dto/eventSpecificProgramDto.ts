import { ApiProperty } from '@nestjs/swagger';

export class EventSpecificProgramDto {
  constructor({ id, runningDate }) {
    this.id = id;
    this.runningDate = runningDate;
  }

  @ApiProperty({
    description: '이벤트 ID',
    name: 'id',
    type: 'number',
    example: 101,
  })
  id: number;

  @ApiProperty({
    description: '이벤트 날짜 및 시간',
    name: 'runningDate',
    type: 'string',
    format: 'date-time',
    example: '2024-12-01T15:00:00Z',
  })
  runningDate: Date;
}
