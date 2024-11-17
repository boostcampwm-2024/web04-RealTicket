import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { USER_STATUS } from '../../../auth/const/userStatus.const';
import { SessionAuthGuard } from '../../../auth/guard/session.guard';
import { AuthService } from '../../../auth/service/auth.service';
import { TransformInterceptor } from '../../../util/convention-transformer/transformer.interceptor';
import { UserCreateDto } from '../dto/userCreate.dto';
import { UserLoginDto } from '../dto/userLogin.dto';
import { UserLoginIdCheckDto } from '../dto/userLoginIdCheck.dto';
import { UserService } from '../service/user.service';

@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}

  @UseInterceptors(TransformInterceptor)
  @HttpCode(HttpStatus.CREATED)
  @Post('signup')
  async signup(@Body() createUserDto: UserCreateDto) {
    await this.userService.registerUser(createUserDto);
    return { message: '회원가입이 성공적으로 완료되었습니다.' };
  }

  @UseInterceptors(TransformInterceptor)
  @Post('signin')
  async signin(@Body() userLoginDto: UserLoginDto, @Res({ passthrough: true }) res: Response) {
    const sessionId = await this.userService.loginUser(userLoginDto.loginId, userLoginDto.loginPassword);
    res.cookie('SID', sessionId, { httpOnly: true, secure: true });
    return { message: '로그인에 성공하셨습니다.' };
  }

  @UseInterceptors(TransformInterceptor)
  @Post('checkid')
  async checkInfo(@Body() userLoginIdCheckDto: UserLoginIdCheckDto) {
    return await this.userService.isAvailableLoginId(userLoginIdCheckDto);
  }
  // 테스트용 함수 삭제할예정
  @UseGuards(SessionAuthGuard(USER_STATUS.LOGIN))
  @Get('userinfo')
  async getUserInfo(@Req() req: Request) {
    const sid = req.cookies['SID'];
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
