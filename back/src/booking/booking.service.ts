import { BadRequestException, Injectable } from '@nestjs/common';

import { AuthService } from '../auth/service/auth.service';
import { EventService } from '../event/service/event.service';

const OFFSET = 1000 * 60 * 60 * 9;

@Injectable()
export class BookingService {
  constructor(
    private readonly eventService: EventService,
    private readonly authService: AuthService,
  ) {}

  // 함수 이름 생각하기
  async isAdmission(eventId: number, sid: string) {
    // event_id를 받아서 해당 이벤트가 존재하는지 확인한다.
    const event = await this.eventService.findSpecificEvent({ eventId });
    const now = new Date(Date.now() + OFFSET);

    // event시간 확인 오픈 시간 이전인지
    if (now <= event.reservationOpenDate) {
      // 예약 시간이 아닙니다.
      throw new BadRequestException('아직 예약 오픈 시간이 아닙니다.');
    } else if (now >= event.reservationCloseDate) {
      //event 시간 확인 이벤트 종료시간 이후인지
      // 예약 시간이 아닙니다.
      throw new BadRequestException('이미 예약 마감된 이벤트입니다.');
    }

    //TODO
    // 입장이 가능하면 user의 상태를 seating room으로 변경하기
    // 좌석 선택
    if (await this.isAvailableSeatingQueue()) {
      await this.authService.setUserStatusSelectingSeat(sid);
      return {
        'waiting-status': true,
        'entering-status': false,
      };
    }
    // TODO
    // 입장이 불가능하면 user의 상태를 waiting room으로 변경하기
    // 대기큐로 입장
    await this.authService.setUserStatusWaiting(sid);
    return {
      'waiting-status': false,
      'entering-status': true,
    };
  }

  // TODO
  // seating room의 상태를 확인하고, 입장이 가능한지 확인하는 로직필요
  async isAvailableSeatingQueue() {
    // seating room의 상태를 확인하고, 입장이 가능한지 확인하는 함수
    return false;
  }
}
