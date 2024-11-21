import { Expose } from 'class-transformer';
import { IsDate, IsNumber, IsString } from 'class-validator';

export class ReservationResultDto {
  @IsString()
  programName: string;

  @IsDate()
  runningDate: Date;

  @IsString()
  @Expose({ name: 'place' })
  placeName: string;

  @IsString({ each: true })
  @Expose({ name: 'reservedSeats' })
  seats: string[];

  @IsNumber()
  price: number;
}
