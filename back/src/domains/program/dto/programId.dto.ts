import { Transform } from 'class-transformer';
import { IsInt } from 'class-validator';

export class ProgramIdDto {
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10), { toClassOnly: true })
  programId: number;
}
