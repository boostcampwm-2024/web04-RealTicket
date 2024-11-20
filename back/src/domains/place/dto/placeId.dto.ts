import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty } from 'class-validator';

export class PlaceIdDto {
  @IsNotEmpty()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10), { toClassOnly: true })
  placeId: number;
}
