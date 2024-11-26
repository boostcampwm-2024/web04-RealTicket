import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty } from 'class-validator';

export class ReservationIdDto {
  @IsNotEmpty()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10), { toClassOnly: true })
  reservationId: number;
}
