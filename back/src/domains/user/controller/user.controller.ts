import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { Request, Response } from 'express';

import { USER_STATUS } from '../../../auth/const/userStatus.const';
import { SessionAuthGuard } from '../../../auth/guard/session.guard';
import { AuthService } from '../../../auth/service/auth.service';
import { ErrorResponseDto } from '../../../common/dto/error-response.dto';
import { SuccessResponseDto } from '../../../common/dto/success-response.dto';
import { User } from '../../../util/user-injection/user.decorator';
import { UserParamDto } from '../../../util/user-injection/userParamDto';
import { USER_ROLE } from '../const/userRole';
import { UserCreateDto } from '../dto/userCreate.dto';
import { UserLoginDto } from '../dto/userLogin.dto';
import { UserLoginIdCheckDto } from '../dto/userLoginIdCheck.dto';
import { UserService } from '../service/user.service';

@ApiTags('User')
@Controller('user')
export class UserController {
  constructor(
    @Inject() private readonly userService: UserService,
    @Inject() private readonly authService: AuthService,
  ) {}

  @ApiOperation({ summary: '회원가입', description: 'id, password를 받아 회원가입 요청을 처리한다.' })
  @ApiBody({
    type: UserCreateDto,
    examples: {
      example: {
        value: {
          loginId: 'test',
          loginPassword: 'test1234',
        },
      },
    },
  })
  @ApiExtraModels(SuccessResponseDto)
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { type: 'object', properties: { message: { type: 'string' } } } } },
      ],
    },
  })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'USER_ALREADY_EXISTS' })
  @HttpCode(HttpStatus.CREATED)
  @Post('signup')
  async signup(@Body() createUserDto: UserCreateDto) {
    await this.userService.registerUser(createUserDto);
    return { message: '회원가입이 성공적으로 완료되었습니다.' };
  }

  @ApiOperation({ summary: '회원가입', description: 'id, password를 받아 회원가입 요청을 처리한다.' })
  @ApiBody({
    type: UserCreateDto,
    examples: {
      example: {
        value: {
          loginId: 'test',
          loginPassword: 'test1234',
        },
      },
    },
  })
  @ApiExtraModels(SuccessResponseDto)
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { type: 'object', properties: { message: { type: 'string' } } } } },
      ],
    },
  })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'USER_ALREADY_EXISTS' })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionAuthGuard(USER_ROLE.ADMIN))
  @Post('signup/admin')
  async signupForAdmin(@Body() createUserDto: UserCreateDto) {
    await this.userService.registerUser(createUserDto, USER_ROLE.ADMIN);
    return { message: '관리자 회원가입이 성공적으로 완료되었습니다.' };
  }

  @ApiOperation({ summary: '게스트 모드', description: '게스트 모드 요청을 받아 게스트 계정을 생성해준다.' })
  @ApiOkResponse({
    schema: {
      allOf: [{ $ref: getSchemaPath(SuccessResponseDto) }, { properties: { data: { type: 'object' } } }],
    },
  })
  @ApiInternalServerErrorResponse({ type: ErrorResponseDto, description: 'USER_GUEST_CREATE_FAILED' })
  @Get('/guest')
  async useGuestMode(@Res({ passthrough: true }) res: Response) {
    const { sessionId, userInfo } = await this.authService.makeGuestUser();
    res.cookie('SID', sessionId, { httpOnly: true });

    return userInfo;
  }

  @UseGuards(SessionAuthGuard(USER_ROLE.ADMIN))
  @Delete('/guest')
  async deleteGuestMode() {
    await this.userService.removeAllGuest();
    return null;
  }

  @ApiOperation({ summary: '로그인', description: 'id, password를 받아 로그인 요청을 처리한다.' })
  @ApiBody({
    type: UserLoginDto,
    examples: {
      example: {
        value: {
          loginId: 'test',
          loginPassword: 'password',
        },
      },
    },
  })
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { type: 'object', properties: { login_id: { type: 'string' } } } } },
      ],
    },
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'AUTH_INVALID_CREDENTIALS' })
  @Post('login')
  async login(@Body() userLoginDto: UserLoginDto, @Res({ passthrough: true }) res: Response) {
    const { sessionId, userInfo } = await this.authService.validateUser(
      userLoginDto.loginId,
      userLoginDto.loginPassword,
    );
    res.cookie('SID', sessionId, { httpOnly: true });

    return userInfo;
  }

  @ApiOperation({ summary: '아이디 중복 체크', description: 'id 중복 체크 요청을 처리한다.' })
  @ApiBody({
    type: UserLoginIdCheckDto,
    examples: {
      example: {
        value: {
          loginId: 'test',
        },
      },
    },
  })
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { type: 'object', properties: { available: { type: 'boolean' } } } } },
      ],
    },
  })
  @Post('checkid')
  async checkInfo(@Body() userLoginIdCheckDto: UserLoginIdCheckDto) {
    return await this.userService.isAvailableLoginId(userLoginIdCheckDto);
  }

  @ApiOperation({ summary: '로그아웃', description: '로그아웃 요청을 처리한다.' })
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { type: 'object', nullable: true } } },
      ],
    },
  })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'AUTH_FORBIDDEN' })
  @UseGuards(SessionAuthGuard(USER_ROLE.USER))
  @Post('logout')
  async getUserLogout(@Req() req: Request, @User() user: UserParamDto) {
    const sid = req.cookies['SID'];
    return await this.authService.logoutUser(sid, user.loginId);
  }

  @ApiOperation({ summary: '사용자 정보', description: '사용자 정보 요청을 처리한다. 사용자 ID를 불러온다.' })
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { type: 'object', nullable: true } } },
      ],
    },
  })
  @ApiInternalServerErrorResponse({ type: ErrorResponseDto, description: 'COMMON_UNKNOWN_ERROR' })
  @Get()
  @UseGuards(SessionAuthGuard(USER_ROLE.USER))
  async getUserInfo(@Req() req: Request) {
    return await this.authService.getUserInfo(req.cookies['SID']);
  }
}
