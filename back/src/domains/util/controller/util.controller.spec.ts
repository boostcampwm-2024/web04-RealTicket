import { Test, TestingModule } from '@nestjs/testing';

import { UtilService } from '../service/util.service';

import { UtilController } from './util.controller';

describe('UtilController', () => {
  let controller: UtilController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UtilController],
      providers: [UtilService],
    }).compile();

    controller = module.get<UtilController>(UtilController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
