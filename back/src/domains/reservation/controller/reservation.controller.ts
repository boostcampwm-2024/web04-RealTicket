import {
  BadRequestException,
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  InternalServerErrorException,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { Request } from 'express';

import { USER_STATUS } from 'src/auth/const/userStatus.const';
import { SessionAuthGuard } from 'src/auth/guard/session.guard';
import { User } from 'src/util/user-injection/user.decorator';
import { UserParamDto } from 'src/util/user-injection/userParamDto';

import { TransformInterceptor } from '../../../util/convention-transformer/transformer.interceptor';
import { ReservationCreateDto } from '../dto/reservationCreateDto';
import { ReservationIdDto } from '../dto/reservationIdDto';
import { ReservationResultDto } from '../dto/reservationResultDto';
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      throw new InternalServerErrorException('서버 내부 에러');
    }
  }

  @Delete(':reservationId')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @UseGuards(SessionAuthGuard(USER_STATUS.LOGIN))
  @ApiOperation({
    summary: '유저 예매 내역 삭제',
    description: '예매 내역이 유저가 예매한 내역이면 삭제한다.',
  })
  @ApiOkResponse({ description: '예매 내역 삭제 성공' })
  @ApiForbiddenResponse({ description: '인증되지 않은 요청', type: Error })
  @ApiBadRequestResponse({
    description: '파라미터 타입 에러, 해당 예매 내역이 없거나 유저가 예매하지 않은 경우',
    type: Error,
  })
  @ApiInternalServerErrorResponse({ description: '서버 내부 에러', type: Error })
  async deleteReservation(@User() user: UserParamDto, @Param() reservationIdDto: ReservationIdDto) {
    try {
      await this.reservationService.deleteReservation(user, reservationIdDto);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException('서버 내부 에러');
    }
  }

  @ApiOperation({
    summary: '예매 확',
    description:
      '예매 확정을 위한 API로 Body 요청을 담아서 보내면 해당 내용을 DB에 저장하고 예약 내역을 반환해준다.',
  })
  @ApiOkResponse({
    description: '예매 확정 성공',
    type: ReservationResultDto,
    example: {
      programName: 'Romeo and Juliet',
      runningDate: '2024-12-01T09:00:00.000Z',
      placeName: 'Grand Theater',
      price: 50,
      seats: ['1구역 1행 2열', '1구역 1행 3열', '1구역 1행 4열', '1구역 1행 2열'],
    },
  })
  @ApiForbiddenResponse({ description: '인증되지 않은 요청' })
  @ApiInternalServerErrorResponse({ description: '서버 내부 에러' })
  //@UseGuards(SessionAuthGuard(USER_STATUS.SELECTING_SEAT))
  @UseInterceptors(TransformInterceptor)
  @Post()
  async createReservation(@Body() reservationCreateDto: ReservationCreateDto, @Req() req: Request) {
    const sid = req.cookies['SID'];
    return this.reservationService.recordReservation(reservationCreateDto, sid);
  }
}
