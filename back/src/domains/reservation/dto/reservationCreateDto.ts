import { IsInt } from 'class-validator';

import { ReservationSeatInfoDto } from './reservationSeatInfoDto';

export class ReservationCreateDto {
  @IsInt()
  eventId: number;

  seats: ReservationSeatInfoDto[];
}
