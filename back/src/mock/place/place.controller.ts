import { Controller } from '@nestjs/common';

import { PlaceService } from './place.service';

@Controller('mock/place')
export class PlaceController {
  constructor(private readonly placeService: PlaceService) {}
}
