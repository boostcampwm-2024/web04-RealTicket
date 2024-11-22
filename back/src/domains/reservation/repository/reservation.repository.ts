import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';

import { Reservation } from '../entity/reservation.entity';

@Injectable()
export class ReservationRepository {
  constructor(@InjectRepository(Reservation) private ReservationRepository: Repository<Reservation>) {}

  async selectAllReservationAfterNowByUserWithAll(userId: number): Promise<Reservation[]> {
    return await this.ReservationRepository.find({
      where: {
        user: { id: userId },
        event: { runningDate: MoreThanOrEqual(new Date()) },
      },
      relations: ['program', 'event', 'reservedSeats'],
    });
  }

  async deleteReservationByIdMatchedUserId(userId: number, reservationId: number) {
    return await this.ReservationRepository.softDelete({
      id: reservationId,
      user: { id: userId },
      deletedAt: null,
    });
  }

  async storeReservation(reservationData: any) {
    const reservation = this.ReservationRepository.create(reservationData);
    return await this.ReservationRepository.save(reservation);
  }
}
