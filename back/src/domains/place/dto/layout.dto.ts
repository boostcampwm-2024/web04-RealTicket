import { Expose } from 'class-transformer';

export class layoutDto {
  @Expose({ name: 'overview' })
  overviewSvg: string;
  sections: any[];
}
