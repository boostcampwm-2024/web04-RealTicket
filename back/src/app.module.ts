import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import ormConfig from './config/typeOrmConfig';

@Module({
  imports: [
    TypeOrmModule.forRoot(ormConfig)
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
