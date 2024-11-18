import { Type } from 'class-transformer';
import { IsDate, IsInt, IsNotEmpty } from 'class-validator';

export class EventCreationDto {
  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  runningDate: Date;

  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  reservationOpenDate: Date;

  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  reservationCloseDate: Date;

  @IsNotEmpty()
  @IsInt()
  programId: number;
}
