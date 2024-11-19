import { Injectable } from '@nestjs/common';

@Injectable()
export class ReservationService {
  getReservations() {
    return [
      {
        id: 1,
        createdAt: new Date(),
        deletedAt: null,
        amount: 2,
        seats: [
          [1, 1],
          [1, 2],
        ],
        programId: 1,
        eventId: 1,
        userId: 1,
      },
      {
        id: 2,
        createdAt: new Date(),
        deletedAt: null,
        amount: 1,
        seats: [[2, 1]],
        programId: 1,
        eventId: 1,
        userId: 1,
      },
    ];
  }
}
