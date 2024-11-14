import { Module } from '@nestjs/common';

import { PlaceService } from './service/place.service';

@Module({
  providers: [PlaceService],
})
export class PlaceModule {}
