import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { CreateUserDto } from '../../user/dto/userCreate.dto';
import { LocalAuthGuard } from '../guard/localAuth.guard';

@Controller('auth')
export class AuthController {
  constructor() {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async logIn(@Body() user: CreateUserDto) {
    return 'login success';
  }
}
