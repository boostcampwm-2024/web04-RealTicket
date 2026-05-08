import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger as WinstonLogger } from 'winston';

export interface TransportLevelMap {
  console?: string;
  criticalFile?: string;
  allFile?: string;
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger,
  ) {}

  getLogLevels(): TransportLevelMap {
    const result: TransportLevelMap = {};
    for (const transport of this.logger.transports) {
      const name = (transport as any).transportName as string | undefined;
      if (name) {
        result[name as keyof TransportLevelMap] = transport.level;
      }
    }
    return result;
  }

  setLogLevels(transports: TransportLevelMap): TransportLevelMap {
    const result: TransportLevelMap = {};
    for (const transport of this.logger.transports) {
      const name = (transport as any).transportName as string | undefined;
      if (name && transports[name as keyof TransportLevelMap] !== undefined) {
        transport.level = transports[name as keyof TransportLevelMap];
        result[name as keyof TransportLevelMap] = transport.level;
      }
    }
    return result;
  }
}
