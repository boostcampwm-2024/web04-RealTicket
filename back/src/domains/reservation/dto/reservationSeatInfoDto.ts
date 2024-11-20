import { IsNumber } from 'class-validator';

export class ReservationSeatInfoDto {
  @IsNumber()
  sectionIndex: number;

  @IsNumber()
  row: number;

  @IsNumber()
  col: number;
}
