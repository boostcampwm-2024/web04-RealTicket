import { WinstonModule } from 'nest-winston';

import { winstonConfig } from './winston.config';

export const winstonLogger = WinstonModule.createLogger(winstonConfig);
