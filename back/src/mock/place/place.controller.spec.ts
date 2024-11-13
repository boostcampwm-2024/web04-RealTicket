import { Test, TestingModule } from '@nestjs/testing';

import { PlaceController } from './place.controller';
import { PlaceService } from './place.service';

describe('PlaceController', () => {
  let controller: PlaceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlaceController],
      providers: [PlaceService],
    }).compile();

    controller = module.get<PlaceController>(PlaceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
