import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { Response } from 'express';

import { CreateUserDto } from '../dto/userLogin.dto';
import { UserService } from '../service/user.service';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @HttpCode(HttpStatus.CREATED)
  @Post('signup')
  async signup(@Body() createUserDto: CreateUserDto) {
    try {
      await this.userService.registerUser(createUserDto);
      return { message: '회원가입이 성공적으로 완료되었습니다.' };
    } catch (err) {
      console.log(err);
      return { message: '회원가입을 실패했습니다.' };
    }
  }

  @Post('signin')
  async signin(@Body() createUserDto: CreateUserDto, @Res({ passthrough: true }) res: Response) {
    const sessionId = await this.userService.loginUser(createUserDto.login_id, createUserDto.login_password);
    res.cookie('SID', sessionId, { httpOnly: true, secure: true, sameSite: 'none' });
    return { message: '로그인에 성공하셨습니다.' };
  }
}
