import { Expose } from 'class-transformer';
import { IsDate, IsNumber, IsString } from 'class-validator';

export class ReservationResultDto {
  @Expose({ name: 'program_name' })
  @IsString()
  programName: string;

  @IsDate()
  @Expose({ name: 'running_date' })
  runningDate: Date;

  @IsString()
  @Expose({ name: 'place' })
  placeName: string;

  @IsString({ each: true })
  @Expose({ name: 'reserved_seats' })
  seats: string[];

  @IsNumber()
  price: number;
}
