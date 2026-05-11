import { ApiProperty } from '@nestjs/swagger';

export class WaitingSseDto {
  constructor(userOrder: number, totalWaiting: number, restMilisecond: number, enteringStatus: boolean) {
    this.userOrder = userOrder;
    this.totalWaiting = totalWaiting;
    this.restMilisecond = restMilisecond;
    this.enteringStatus = enteringStatus;
  }

  @ApiProperty({ name: 'userOrder', example: 7, description: 'Current user-specific waiting order' })
  userOrder: number;

  @ApiProperty({ name: 'totalWaiting', example: 22, description: 'Total waiting users' })
  totalWaiting: number;

  @ApiProperty({ name: 'restMilisecond', example: 7000, description: 'Estimated remaining wait time in ms' })
  restMilisecond: number;

  @ApiProperty({ name: 'enteringStatus', example: false, description: 'Whether this user may enter booking' })
  enteringStatus: boolean;
}
