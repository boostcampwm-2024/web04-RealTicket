import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsObject, IsOptional, ValidateNested } from 'class-validator';

const VALID_LEVELS = ['error', 'warn', 'http', 'info', 'debug', 'silly'] as const;

class TransportLevelsDto {
  @ApiProperty({ required: false, enum: VALID_LEVELS, example: 'info' })
  @IsOptional()
  @IsIn(VALID_LEVELS)
  console?: string;

  @ApiProperty({ required: false, enum: VALID_LEVELS, example: 'warn' })
  @IsOptional()
  @IsIn(VALID_LEVELS)
  criticalFile?: string;

  @ApiProperty({ required: false, enum: VALID_LEVELS, example: 'silly' })
  @IsOptional()
  @IsIn(VALID_LEVELS)
  allFile?: string;
}

export class UpdateLogLevelDto {
  @ApiProperty({ type: TransportLevelsDto })
  @IsObject()
  @ValidateNested()
  @Type(() => TransportLevelsDto)
  transports: TransportLevelsDto;
}
