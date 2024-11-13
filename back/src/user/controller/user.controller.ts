import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';

import { USER_STATUS } from '../../auth/const/userStatus.const';
import { SessionAuthGuard } from '../../auth/guard/session.guard';
import { AuthService } from '../../auth/service/auth.service';
import { CreateUserDto } from '../dto/userLogin.dto';
import { UserService } from '../service/user.service';

@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}

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

  @UseGuards(SessionAuthGuard(USER_STATUS.LOGIN))
  @Get('userinfo')
  async getUserInfo(@Req() req: Request) {
    const sid = req.cookies['SID'];
    console.log('SID:', sid);
    await this.authService.setUserStatusAdmin(sid);
    return { message: 'User information retrieved successfully.' };
  }

  @UseGuards(SessionAuthGuard(USER_STATUS.LOGIN))
  @Post('logout')
  async getUserLogout(@Req() req: Request) {
    const sid = req.cookies['SID'];
    return await this.userService.logoutUser(sid);
  }
}
