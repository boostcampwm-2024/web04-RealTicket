import { Controller } from '@nestjs/common';

import { UtilService } from '../service/util.service';

@Controller('util')
export class UtilController {
  constructor(private readonly utilService: UtilService) {}
}
