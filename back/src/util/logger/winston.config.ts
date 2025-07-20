import * as path from 'node:path';

import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';
import winstonDaily from 'winston-daily-rotate-file';

const logDir = path.join(__dirname, '../../../logs');

const dailyOptions = (name: string, level?: string) => {
  return {
    level: level || (process.env.NODE_ENV === 'prod' ? 'info' : 'silly'),
    datePattern: 'YYYY-MM-DD',
    dirname: path.join(logDir, name),
    filename: `%DATE%.${name}.log`,
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: process.env.NODE_ENV === 'prod' ? '30d' : '9999d',
  };
};

export const winstonConfig = {
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),

  transports: [
    new winston.transports.Console({
      level: process.env.NODE_ENV === 'prod' ? 'warn' : 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.ms(),
        nestWinstonModuleUtilities.format.nestLike('RealTicket', {
          colors: true,
          prettyPrint: true,
          processId: true,
          appName: true,
        }),
      ),
    }),

    new winstonDaily(dailyOptions('critical', 'warn')),
    new winstonDaily(dailyOptions('all')),
  ],
};
