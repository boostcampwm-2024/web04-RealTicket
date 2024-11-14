import { Module } from '@nestjs/common';

import { PlaceService } from './place.service';

@Module({
  providers: [PlaceService],
})
export class PlaceModule {}
