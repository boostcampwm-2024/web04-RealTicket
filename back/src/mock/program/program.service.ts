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

  getProgramById(programId: number) {
    return {
      id: programId,
      name: '맘마미아',
      'running-time': 1234,
      genre: '연극',
      actors: '김동현, 김동현',
      place: {
        id: 1,
        name: '대극장',
      },
      'profile-url': null,
      price: 15000,
      events: [
        {
          id: 1,
          'running-date': '2024-11-01 09:00',
        },
        {
          id: 2,
          'running-date': '2024-11-01 12:00',
        },
      ],
    };
  }
}
