import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';

import { SessionAuthGuard } from '../auth/guard/session.guard';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { SuccessResponseDto } from '../common/dto/success-response.dto';
import { USER_ROLE } from '../domains/user/const/userRole';
import { AdminService } from './admin.service';
import { UpdateLogLevelDto } from './dto/update-log-level.dto';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @ApiOperation({ summary: '로그 레벨 조회', description: '현재 Winston 트랜스포트별 로그 레벨을 조회한다.' })
  @ApiExtraModels(SuccessResponseDto)
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        {
          properties: {
            data: {
              type: 'object',
              properties: {
                console: { type: 'string', example: 'debug' },
                criticalFile: { type: 'string', example: 'warn' },
                allFile: { type: 'string', example: 'silly' },
              },
            },
          },
        },
      ],
    },
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'AUTH_FORBIDDEN' })
  @UseGuards(SessionAuthGuard(USER_ROLE.ADMIN))
  @Get('log-level')
  getLogLevel() {
    return this.adminService.getLogLevels();
  }

  @ApiOperation({ summary: '로그 레벨 변경', description: '런타임 중 Winston 트랜스포트별 로그 레벨을 즉시 변경한다.' })
  @ApiBody({ type: UpdateLogLevelDto })
  @ApiExtraModels(SuccessResponseDto)
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        {
          properties: {
            data: {
              type: 'object',
              properties: {
                console: { type: 'string', example: 'info' },
                criticalFile: { type: 'string', example: 'error' },
                allFile: { type: 'string', example: 'warn' },
              },
            },
          },
        },
      ],
    },
  })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'AUTH_FORBIDDEN' })
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard(USER_ROLE.ADMIN))
  @Patch('log-level')
  setLogLevel(@Body() dto: UpdateLogLevelDto) {
    return this.adminService.setLogLevels(dto.transports);
  }
}
