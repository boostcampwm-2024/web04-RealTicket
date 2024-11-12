import { Injectable } from '@nestjs/common';

@Injectable()
export class ProgramService {
  findAll() {
    return `This action returns all program`;
  }

  findOne(id: number) {
    return `This action returns a #${id} program`;
  }
}
