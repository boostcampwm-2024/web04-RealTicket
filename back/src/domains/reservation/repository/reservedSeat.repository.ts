import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ReservedSeat } from '../entity/reservedSeat.entity';

@Injectable()
export class ReservedSeatRepository {
  constructor(@InjectRepository(ReservedSeat) private reservedSeatRepository: Repository<ReservedSeat>) {}

  storeReservedSeat(reservedSeatData: any) {
    const reservedSeat = this.reservedSeatRepository.create(reservedSeatData);
    return this.reservedSeatRepository.save(reservedSeat);
  }
}