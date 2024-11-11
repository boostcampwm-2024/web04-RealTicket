import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';

import { LocalAuthGuard } from '../../auth/guard/localAuth.guard';
import { AuthenticatedRequest } from '../../auth/types/authenticated-request.interface';
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

  @UseGuards(LocalAuthGuard)
  @Post('signin')
  async signin(@Req() req: AuthenticatedRequest) {
    const { SID } = req.user; // LocalStrategy에서 추가된 세션 ID
    console.log(SID);
    req.res.cookie('SID', SID, {
      httpOnly: true,
      secure: true,
      maxAge: 3600 * 1000,
    });
    return { message: '로그인에 성공하셨습니다.' };
  }
}
