import { Transform } from 'class-transformer';
import { IsInt } from 'class-validator';

export class EventIdDto {
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10), { toClassOnly: true })
  eventId: number;
}
