import { IsBoolean } from 'class-validator';

export class BookingAdmissionStatusDto {
  @IsBoolean()
  waitingStatus: boolean;
  @IsBoolean()
  enteringStatus: boolean;
}
