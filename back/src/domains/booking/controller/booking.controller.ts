import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiExtraModels,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { Request, Response } from 'express';

import { USER_STATUS } from '../../../auth/const/userStatus.const';
import { SessionAuthGuard } from '../../../auth/guard/session.guard';
import { AuthService } from '../../../auth/service/auth.service';
import { ErrorResponseDto } from '../../../common/dto/error-response.dto';
import { SuccessResponseDto } from '../../../common/dto/success-response.dto';
import { SeatStatus } from '../const/seatStatus.enum';
import { BookingAmountReqDto } from '../dto/bookingAmountReq.dto';
import { BookingAmountResDto } from '../dto/bookingAmountRes.dto';
import { BookingReqDto } from '../dto/bookingReq.dto';
import { BookingResDto } from '../dto/bookingRes.dto';
import { InBookingSizeReqDto } from '../dto/inBookingSizeReq.dto';
import { InBookingSizeResDto } from '../dto/inBookingSizeRes.dto';
import { OccupiedSeatsSseDto, SeatsSseDto } from '../dto/seatsSse.dto';
import { ServerTimeDto } from '../dto/serverTime.dto';
import { WaitingSseDto } from '../dto/waitingSse.dto';
import { BookingSeatsService } from '../service/booking-seats.service';
import { BookingService } from '../service/booking.service';
import { InBookingService } from '../service/in-booking.service';
import { OpenBookingService } from '../service/open-booking.service';
import { WaitingQueueService } from '../service/waiting-queue.service';

@Controller('booking')
export class BookingController {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly authService: AuthService,
    private readonly bookingService: BookingService,
    private readonly inBookingService: InBookingService,
    private readonly bookingSeatsService: BookingSeatsService,
    private readonly waitingQueueService: WaitingQueueService,
    private readonly openBookingService: OpenBookingService,
  ) {}

  @UseGuards(SessionAuthGuard())
  @Get('permission/:eventId')
  async requestAdmission(
    @Param('eventId', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_ACCEPTABLE })) eventId: number,
    @Req() req: Request,
  ) {
    const sid = req.cookies['SID'];
    return await this.bookingService.isAdmission(eventId, sid);
  }

  @Get('re-permission/:eventId')
  @UseGuards(SessionAuthGuard(USER_STATUS.WAITING))
  @ApiOperation({
    summary: '대기큐 현황 SSE',
    description: '대기큐의 대기 현황을 구독한다.',
  })
  @ApiOkResponse({ description: 'SSE 연결 성공', type: WaitingSseDto })
  @ApiUnauthorizedResponse({ description: '인증 실패' })
  async subscribeWaitingQueue(
    @Param('eventId', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) eventId: number,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const sid = req.cookies['SID'];
    await this.waitingQueueService.addSseClient(eventId, res, sid);

    req.on('close', () => {
      this.waitingQueueService.removeSseClient(eventId, res);
    });
  }

  @Post('count')
  @UseGuards(SessionAuthGuard([USER_STATUS.ENTERING, USER_STATUS.SELECTING_SEAT]))
  @ApiOperation({ summary: '예매 인원 설정', description: '예매할 인원 수를 설정한다.' })
  @ApiBody({ type: BookingAmountReqDto })
  @ApiExtraModels(SuccessResponseDto, BookingAmountResDto)
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { $ref: getSchemaPath(BookingAmountResDto) } } },
      ],
    },
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'AUTH_UNAUTHORIZED' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'COMMON_INVALID_INPUT' })
  async setBookingAmount(@Req() req: Request, @Body() dto: BookingAmountReqDto) {
    const sid = req.cookies['SID'];
    const result = await this.bookingService.setBookingAmount(sid, dto.bookingAmount);
    return new BookingAmountResDto(result);
  }

  @Get('seat/:eventId')
  @UseGuards(
    SessionAuthGuard([USER_STATUS.ENTERING, USER_STATUS.SELECTING_SEAT, USER_STATUS.RECONNECTING_SELECTING]),
  )
  @ApiOperation({
    summary: '실시간 좌석 예약 현황 SSE',
    description:
      '실시간으로 좌석 예약 현황을 조회한다. query.section이 있으면 해당 섹션 풀에 직접 등록되고, 없으면 init 풀에 등록된다.',
  })
  @ApiQuery({
    name: 'section',
    required: false,
    type: Number,
    description: '구독할 섹션 인덱스 (0 이상). 미지정 시 init 풀에 등록.',
  })
  @ApiExtraModels(SeatsSseDto, OccupiedSeatsSseDto)
  @ApiOkResponse({
    description: 'SSE 연결 성공',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(SeatsSseDto) },
        { $ref: getSchemaPath(OccupiedSeatsSseDto) },
      ],
    },
  })
  @ApiUnauthorizedResponse({ description: '인증 실패' })
  async getReservationStatusByEventId(
    @Param('eventId', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) eventId: number,
    @Query('section') sectionRaw: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const sid = req.cookies['SID'];

    // T-5: query.section 입력 검증 — parseInt + Number.isFinite + ≥ 0
    const sectionIndex =
      sectionRaw !== undefined && /^\d+$/.test(sectionRaw) ? parseInt(sectionRaw, 10) : null;

    // D-A1·D-04: USER_STATUS 정상화 — ENTERING/RECONNECTING → SELECTING_SEAT 승격
    const session = await this.authService.getUserSession(sid);
    if (session.userStatus === USER_STATUS.ENTERING) {
      await this.bookingService.setInBookingFromEntering(sid);
    } else if (session.userStatus === USER_STATUS.RECONNECTING_SELECTING) {
      await this.inBookingService.removeReconnectingSession(eventId, sid);
      await this.authService.setUserStatusSelectingSeat(sid);
    }

    // D-04: 풀 등록 단일 분기 (query.section 유무로 결정)
    let seq: number;
    if (sectionIndex !== null && Number.isFinite(sectionIndex) && sectionIndex >= 0) {
      seq = await this.bookingSeatsService.addSseClientToSection(eventId, sectionIndex, res, sid);
    } else {
      seq = await this.bookingSeatsService.addSseClient(eventId, res, sid);
    }

    // D-02·D-05: close handler — closure로 등록 당시 section/seq 캡처
    const registeredSection = sectionIndex;
    req.on('close', async () => {
      const closeResult = await this.bookingSeatsService.removeSseClient(eventId, sid, res, {
        expectedSeq: seq,
        sectionIndex: registeredSection,
      });

      if (!closeResult.activeConnectionClosed) {
        return;
      }

      if (closeResult.saved) {
        await this.bookingService.onSeatsSseDisconnected({ sid });
      } else {
        await this.authService.setUserStatusReconnectingSelecting(sid);
        await this.inBookingService.addReconnectingSession(eventId, sid);
      }
    });
  }

  @Post('')
  @UseGuards(SessionAuthGuard(USER_STATUS.SELECTING_SEAT))
  @ApiOperation({
    summary: '좌석 점유/취소',
    description: '좌석 하나를 대상으로 점유/취소 요청을 보낸다.',
  })
  @ApiExtraModels(SuccessResponseDto, BookingResDto)
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { $ref: getSchemaPath(BookingResDto) } } },
      ],
    },
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'AUTH_UNAUTHORIZED' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'COMMON_INVALID_INPUT' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'SEAT_ALREADY_OCCUPIED | SEAT_NOT_OCCUPIED' })
  async updateSeatOccupancy(@Req() req: Request, @Body() dto: BookingReqDto) {
    const sid = req.cookies['SID'];

    if (dto.expectedStatus === SeatStatus.RESERVE) {
      const result = await this.bookingSeatsService.bookSeat(sid, [dto.sectionIndex, dto.seatIndex]);
      return new BookingResDto(result);
    } else if (dto.expectedStatus === SeatStatus.DELETE) {
      const result = await this.bookingSeatsService.unBookSeat(sid, [dto.sectionIndex, dto.seatIndex]);
      return new BookingResDto(result);
    }
  }

  @ApiOperation({ summary: '서버 시간 조회', description: '서버의 현재 시간을 조회한다.' })
  @ApiExtraModels(SuccessResponseDto, ServerTimeDto)
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { $ref: getSchemaPath(ServerTimeDto) } } },
      ],
    },
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'AUTH_UNAUTHORIZED' })
  @ApiInternalServerErrorResponse({ type: ErrorResponseDto, description: 'COMMON_UNKNOWN_ERROR' })
  @UseGuards(SessionAuthGuard())
  @Get('server-time')
  async getServerTime() {
    return await this.bookingService.getTimeMs();
  }

  @Post('in-booking-pool-size/event/:eventId')
  @UseGuards(SessionAuthGuard(USER_STATUS.ADMIN))
  @ApiOperation({
    summary: 'ADMIN: 좌석 선택창 인원 설정',
    description: '특정 이벤트의 좌석 선택창에 입장 가능한 인원 수를 설정한다.',
  })
  @ApiExtraModels(SuccessResponseDto, InBookingSizeResDto)
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { $ref: getSchemaPath(InBookingSizeResDto) } } },
      ],
    },
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'AUTH_UNAUTHORIZED' })
  async setInBookingSessionsMaxSize(@Param('eventId') eventId: number, @Body() dto: InBookingSizeReqDto) {
    const maxSize = dto.maxSize;
    const setSize = await this.inBookingService.setInBookingSessionsMaxSize(eventId, maxSize);
    return new InBookingSizeResDto(setSize);
  }

  @Post('in-booking-pool-size/all')
  @UseGuards(SessionAuthGuard(USER_STATUS.ADMIN))
  @ApiOperation({
    summary: 'ADMIN: 좌석 선택창 인원 설정(ALL)',
    description: '모든 이벤트의 좌석 선택창에 입장 가능한 인원 수를 설정한다.',
  })
  @ApiExtraModels(SuccessResponseDto, InBookingSizeResDto)
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { $ref: getSchemaPath(InBookingSizeResDto) } } },
      ],
    },
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'AUTH_UNAUTHORIZED' })
  async setAllInBookingSessionsMaxSize(@Body() dto: InBookingSizeReqDto) {
    const maxSize = dto.maxSize;
    const setSize = await this.inBookingService.setAllInBookingSessionsMaxSize(maxSize);
    return new InBookingSizeResDto(setSize);
  }

  @Post('in-booking-pool-size/default')
  @UseGuards(SessionAuthGuard(USER_STATUS.ADMIN))
  @ApiOperation({
    summary: 'ADMIN: 좌석 선택창 인원 기본값 설정',
    description: '좌석 선택창에 입장 가능한 인원 수의 기본값을 설정한다.',
  })
  @ApiExtraModels(SuccessResponseDto, InBookingSizeResDto)
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { $ref: getSchemaPath(InBookingSizeResDto) } } },
      ],
    },
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'AUTH_UNAUTHORIZED' })
  async setInBookingSessionsDefaultMaxSize(@Body() dto: InBookingSizeReqDto) {
    const defaultMaxSize = dto.maxSize;
    const setSize = await this.inBookingService.setInBookingSessionsDefaultMaxSize(defaultMaxSize);
    return new InBookingSizeResDto(setSize);
  }

  @Post('reload-open-target')
  @UseGuards(SessionAuthGuard(USER_STATUS.ADMIN))
  @ApiOperation({
    summary: 'ADMIN: 오픈 대상 이벤트 재확인',
    description: '오픈 대상 이벤트를 다시 확인하여 오픈한다.',
  })
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { type: 'object', nullable: true } } },
      ],
    },
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'AUTH_UNAUTHORIZED' })
  async reloadOpenTarget() {
    await this.openBookingService.scheduleUpcomingReservations();
  }

  @Post('init/:eventId')
  @UseGuards(SessionAuthGuard(USER_STATUS.ADMIN))
  @ApiOperation({
    summary: 'ADMIN: 예약 초기화',
    description: '특정 이벤트의 예약 상태를 초기화한다.',
  })
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { type: 'object', nullable: true } } },
      ],
    },
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'AUTH_UNAUTHORIZED' })
  async initReservation(@Param('eventId') eventId: number) {
    await this.openBookingService.initReservation(eventId);
  }
}
