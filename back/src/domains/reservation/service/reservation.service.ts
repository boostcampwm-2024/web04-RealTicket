import { RedisService } from '@liaoliaots/nestjs-redis';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

import { UserParamDto } from 'src/util/user-injection/userParamDto';

import { Event } from '../../event/entity/event.entity';
import { EventRepository } from '../../event/repository/event.reposiotry';
import { Program } from '../../program/entities/program.entity';
import { UserRepository } from '../../user/repository/user.repository';
import { ReservationCreateDto } from '../dto/reservationCreateDto';
import { ReservationIdDto } from '../dto/reservationIdDto';
import { ReservationResultDto } from '../dto/reservationResultDto';
import { ReservationSeatInfoDto } from '../dto/reservationSeatInfoDto';
import { ReservationSpecificDto } from '../dto/reservationSepecificDto';
import { Reservation } from '../entity/reservation.entity';
import { ReservedSeat } from '../entity/reservedSeat.entity';
import { ReservationRepository } from '../repository/reservation.repository';
import { ReservedSeatRepository } from '../repository/reservedSeat.repository';

@Injectable()
export class ReservationService {
  private redis: Redis;
  private logger: Logger = new Logger(ReservationService.name);

  constructor(
    @Inject() private readonly reservationRepository: ReservationRepository,
    @Inject() private readonly redisService: RedisService,
    @Inject() private readonly eventRepository: EventRepository,
    @Inject() private readonly userRepository: UserRepository,
    @Inject() private readonly reservedSeatRepository: ReservedSeatRepository,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  async findUserReservation({ id }: UserParamDto) {
    const reservations: Reservation[] =
      await this.reservationRepository.selectAllReservationAfterNowByUser(id);
    return await this.convertReservationListToSpecificDto(reservations);
  }

  private async convertReservationListToSpecificDto(
    reservations: Reservation[],
  ): Promise<ReservationSpecificDto[]> {
    return Promise.all(
      reservations.map(async (reservation: Reservation) => {
        const [program, event, reservedSeats] = await Promise.all([
          reservation.program,
          reservation.event,
          reservation.reservedSeats,
        ]);
        const place = await program.place;

        return new ReservationSpecificDto({
          id: reservation.id,
          programName: program.name,
          runningDate: event.runningDate,
          placeName: place.name,
          seats: this.makeStringFormatFromReservedSeats(reservedSeats),
        });
      }),
    );
  }

  private makeStringFormatFromReservedSeats(reservedSeats: ReservedSeat[]) {
    return reservedSeats
      .map((seat) => {
        return `${seat.section}구역 ${seat.row}행 ${seat.col}열`;
      })
      .join(', ');
  }

  async deleteReservation({ id }: UserParamDto, { reservationId }: ReservationIdDto) {
    const result = await this.reservationRepository.deleteReservationByIdMatchedUserId(id, reservationId);
    if (!result.affected)
      throw new BadRequestException(`사용자의 해당 예매 내역[${reservationId}]가 존재하지 않습니다.`);
  }

  async recordReservation(reservationCreateDto: ReservationCreateDto, sid): Promise<ReservationResultDto> {
    try {
      if (this.validateReservationLength(reservationCreateDto.seats)) {
        throw new BadRequestException('예매 가능한 좌석 수는 1~4개 입니다.');
      }
      const userId = JSON.parse(await this.redis.get(sid)).id;
      const event: Event = await this.eventRepository.selectEvent(reservationCreateDto.eventId);
      const program = await event.program;
      const reservation = await this.makeReservation(reservationCreateDto, program, event, userId);
      const reservedSeats = await this.makeReservedSeat(reservationCreateDto, reservation);

      // 예약정보 반환
      return {
        programName: program.name,
        runningDate: event.runningDate,
        placeName: (await program.place).name,
        price: program.price,
        seats: reservedSeats,
      };
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException('예매 정보 저장에 실패');
    }
  }

  validateReservationLength(seats: ReservationSeatInfoDto[]) {
    return seats.length < 0 || seats.length > 4;
  }

  // reservation 테이블에 reservation을 저장하는 함수
  async makeReservation(
    reservationCreateDto: ReservationCreateDto,
    program: Program,
    event: Event,
    userId: number,
  ) {
    // reservation 정보 저장
    const reservationData: any = {
      createdAt: new Date(),
      amount: reservationCreateDto.seats.length,
      program: program,
      event: event,
      user: await this.userRepository.findById(userId),
    };
    return await this.reservationRepository.storeReservation(reservationData);
  }

  async makeReservedSeat(reservationCreateDto: ReservationCreateDto, reservation: Reservation[]) {
    return await Promise.all(
      reservationCreateDto.seats.map(async (seat) => {
        const reservedSeatData: any = {
          section: seat.sectionIndex,
          row: seat.row,
          col: seat.col,
          reservation: reservation,
        };
        const reservedSeat = await this.reservedSeatRepository.storeReservedSeat(reservedSeatData);
        return `${reservedSeat['section']}구역 ${reservedSeat['row']}행 ${reservedSeat['col']}열`;
      }),
    );
  }
}
