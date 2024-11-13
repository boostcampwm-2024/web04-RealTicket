import { Injectable } from '@nestjs/common';

@Injectable()
export class ProgramService {
  getPrograms() {
    return {
      programs: [
        {
          id: 1,
          name: '맘마미아',
          genre: '연극',
          place: {
            id: 1,
            name: '대극장',
          },
          'profile-url': null,
        },
      ],
    };
  }
}
