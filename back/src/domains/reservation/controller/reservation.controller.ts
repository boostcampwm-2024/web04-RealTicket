import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  getSchemaPath,
} from '@nestjs/swagger';
import { Request } from 'express';

import { USER_STATUS } from 'src/auth/const/userStatus.const';
import { SessionAuthGuard } from 'src/auth/guard/session.guard';
import { ErrorResponseDto } from 'src/common/dto/error-response.dto';
import { SuccessResponseDto } from 'src/common/dto/success-response.dto';
import { User } from 'src/util/user-injection/user.decorator';
import { UserParamDto } from 'src/util/user-injection/userParamDto';

import { ReservationCreateDto } from '../dto/reservationCreate.dto';
import { ReservationIdDto } from '../dto/reservationId.dto';
import { ReservationResultDto } from '../dto/reservationResult.dto';
import { ReservationSpecificDto } from '../dto/reservationSepecific.dto';
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
  @ApiExtraModels(SuccessResponseDto, ReservationSpecificDto)
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { type: 'array', items: { $ref: getSchemaPath(ReservationSpecificDto) } } } },
      ],
    },
  })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'AUTH_FORBIDDEN' })
  @ApiInternalServerErrorResponse({ type: ErrorResponseDto, description: 'COMMON_UNKNOWN_ERROR' })
  async findReservation(@User() user: UserParamDto) {
    const reservations: ReservationSpecificDto[] = await this.reservationService.findUserReservation(user);
    return reservations;
  }

  @Delete(':reservationId')
  @UseGuards(SessionAuthGuard(USER_STATUS.LOGIN))
  @ApiOperation({
    summary: '유저 예매 내역 삭제',
    description: '예매 내역이 유저가 예매한 내역이면 삭제한다.',
  })
  @ApiParam({ name: 'reservationId', description: '예매 내역 아이디', type: Number })
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { type: 'object', nullable: true } } },
      ],
    },
  })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'AUTH_FORBIDDEN' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'RESERVATION_NOT_FOUND | RESERVATION_FORBIDDEN',
  })
  @ApiInternalServerErrorResponse({ type: ErrorResponseDto, description: 'COMMON_UNKNOWN_ERROR' })
  async deleteReservation(@User() user: UserParamDto, @Param() reservationIdDto: ReservationIdDto) {
    await this.reservationService.deleteReservation(user, reservationIdDto);
    return null;
  }

  @ApiOperation({
    summary: '예매 확정',
    description:
      '예매 확정을 위한 API로 Body 요청을 담아서 보내면 해당 내용을 DB에 저장하고 예약 내역을 반환해준다.',
  })
  @ApiExtraModels(SuccessResponseDto, ReservationResultDto)
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { $ref: getSchemaPath(ReservationResultDto) } } },
      ],
    },
  })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'AUTH_FORBIDDEN' })
  @ApiInternalServerErrorResponse({ type: ErrorResponseDto, description: 'COMMON_UNKNOWN_ERROR' })
  @UseGuards(SessionAuthGuard(USER_STATUS.SELECTING_SEAT))
  @Post()
  async createReservation(@Body() reservationCreateDto: ReservationCreateDto, @Req() req: Request) {
    return await this.reservationService.recordReservationTransaction(
      reservationCreateDto,
      req.cookies['SID'],
    );
  }
}
