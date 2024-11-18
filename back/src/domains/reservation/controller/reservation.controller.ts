import { ClassSerializerInterceptor, Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';

import { USER_STATUS } from 'src/auth/const/userStatus.const';
import { SessionAuthGuard } from 'src/auth/guard/session.guard';
import { User } from 'src/util/user-injection/user.decorator';
import { UserParamDto } from 'src/util/user-injection/userParamDto';

import { ReservationSpecificDto } from '../dto/reservationSepecificDto';
import { ReservationService } from '../service/reservation.service';

@Controller('reservation')
@UseInterceptors(ClassSerializerInterceptor)
export class ReservationController {
  constructor(private readonly reservationService: ReservationService) {}

  @UseGuards(SessionAuthGuard(USER_STATUS.LOGIN))
  @Get()
  @ApiOperation({
    summary: '유저 예매 내역 조회',
    description: '현재 시간 <= event 시작 시간 이후의 유저 예매 내역을 조회한다.',
  })
  @ApiOkResponse({ description: '예매 내역 조회 성공', type: ReservationSpecificDto, isArray: true })
  @ApiForbiddenResponse({ description: '인증되지 않은 요청', type: Error })
  @ApiInternalServerErrorResponse({ description: '서버 내부 에러', type: Error })
  async findReservation(@User() user: UserParamDto) {
    try {
      const reservations: ReservationSpecificDto[] = await this.reservationService.findUserReservation(user);
      return reservations;
    } catch (error) {
      throw error;
    }
  }
}
