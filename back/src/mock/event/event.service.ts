import { Injectable } from '@nestjs/common';

@Injectable()
export class EventService {
  getEventById(eventId: number) {
    return {
      id: eventId,
      name: '맘마미아',
      place: {
        id: 1,
        name: '대극장',
      },
      'running-time': 1000,
      'running-date': '2024-11-13 19:19',
      'reservation-open-date': '2024-11-11 10:00',
    };
  }
}
