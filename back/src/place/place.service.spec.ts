import { Test, TestingModule } from '@nestjs/testing';

import { PlaceService } from './place.service';

describe('PlaceService', () => {
  let service: PlaceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlaceService],
    }).compile();

    service = module.get<PlaceService>(PlaceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
