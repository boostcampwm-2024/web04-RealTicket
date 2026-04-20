import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty } from 'class-validator';

export class EventIdDto {
  @IsNotEmpty()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10), { toClassOnly: true })
  eventId: number;
}
