import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { UserParamDto } from 'src/util/user-injection/userParamDto';

import { ReservationIdDto } from '../dto/reservationIdDto';
import { ReservationSpecificDto } from '../dto/reservationSepecificDto';
import { Reservation } from '../entity/reservation.entity';
import { ReservedSeat } from '../entity/reservedSeat.entity';
import { ReservationRepository } from '../repository/reservation.repository';

@Injectable()
export class ReservationService {
  constructor(@Inject() private readonly reservationRepository: ReservationRepository) {}

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
}
