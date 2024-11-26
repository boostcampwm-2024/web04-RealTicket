import { ApiProperty } from '@nestjs/swagger';

export class WaitingSseDto {
  constructor(headOrder: number, totalWaiting: number, throughputRate: number) {
    this.headOrder = headOrder;
    this.totalWaiting = totalWaiting;
    this.throughputRate = throughputRate;
  }

  @ApiProperty({ name: 'headOrder', example: 7, description: '대기열의 가장 앞에 있는 사람의 번호표' })
  headOrder: number;

  @ApiProperty({ name: 'totalWaiting', example: 22, description: '대기 중인 사람의 수' })
  totalWaiting: number;

  @ApiProperty({ name: 'throughputRate', example: 1000, description: '한 사람당 예상되는 대기 시간(ms)' })
  throughputRate: number;
}
