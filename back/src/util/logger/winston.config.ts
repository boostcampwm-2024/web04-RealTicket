import * as path from 'node:path';

import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';
import winstonDaily from 'winston-daily-rotate-file';

import { getLocalISOString } from '../date-util';

const logDir = path.join(__dirname, '../../../logs');

const dailyOptions = (name: string, level?: string) => {
  const baseLevel = level || (process.env.LOGGING_MODE === 'prod' ? 'info' : 'silly');

  if (process.env.LOG_SAVE_MODE === 'prod') {
    return {
      level: baseLevel,
      datePattern: 'YYYY-MM-DD',
      dirname: path.join(logDir, process.env.LOG_SAVE_MODE, name),
      filename: `%DATE%.${name}.log`,
      zippedArchive: process.env.LOG_ZIP === 'true',
      maxSize: process.env.LOG_MAX_SIZE,
      maxFiles: process.env.LOG_MAX_LIFE,
      utc: false,
      options: {
        flags: 'a',
      },
    };
  } else {
    const runTimestamp = getLocalISOString()
      .replace('T', '_')
      .replace('Z', '')
      .replaceAll(':', '-')
      .split('.')[0];
    const HMSstamp = runTimestamp.split('_')[1];
    return {
      level: baseLevel,
      datePattern: 'YYYY-MM-DD',
      dirname: path.join(logDir, process.env.LOG_SAVE_MODE, name, 'start-at_' + runTimestamp),
      filename: `%DATE%_${HMSstamp}.${name}.log`,
      zippedArchive: process.env.LOG_ZIP === 'true',
      maxSize: process.env.LOG_MAX_SIZE,
      maxFiles: process.env.LOG_MAX_LIFE,
      utc: false,
      options: {
        flags: 'a',
      },
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
    Object.assign(
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
      { transportName: 'console' },
    ),

    ...(process.env.LOG_SAVE_MODE
      ? [
          Object.assign(new winstonDaily(dailyOptions('critical', 'warn')), { transportName: 'criticalFile' }),
          Object.assign(new winstonDaily(dailyOptions('all')), { transportName: 'allFile' }),
        ]
      : []),
  ],
};
