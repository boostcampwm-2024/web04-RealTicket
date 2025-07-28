import * as path from 'node:path';

import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';
import winstonDaily from 'winston-daily-rotate-file';

const logDir = path.join(__dirname, '../../../logs');

const dailyOptions = (name: string, level?: string) => {
  const baseLevel = level || (process.env.LOGGING_MODE === 'prod' ? 'info' : 'silly');

  if (process.env.LOG_SAVE_MODE === 'prod') {
    return {
      level: baseLevel,
      datePattern: 'YYYY-MM-DD',
      dirname: path.join(logDir, name),
      filename: `%DATE%.${name}.log`,
      zippedArchive: process.env.LOG_ZIP === 'true',
      maxSize: process.env.LOG_MAX_SIZE,
      maxFiles: process.env.LOG_MAX_LIFE,
    };
  } else {
    const timestamp = new Date().toISOString().replace(/T/, '-').replace(/:/g, '-').replace(/\..+/, '');
    return {
      level: baseLevel,
      dirname: path.join(logDir, name),
      filename: `${timestamp}-%i.${name}.log`,
      zippedArchive: process.env.LOG_ZIP === 'true',
      maxSize: process.env.LOG_MAX_SIZE,
      maxFiles: process.env.LOG_MAX_LIFE,
    };
  }
};

export const winstonConfig = {
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),

  transports: [
    new winston.transports.Console({
      level: process.env.LOGGING_MODE === 'prod' ? 'warn' : 'debug',
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
