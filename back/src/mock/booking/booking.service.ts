import { Injectable } from '@nestjs/common';
import { interval, Observable, takeWhile } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class BookingService {
  rePermission(eventId: number): Observable<any> {
    return interval(1000).pipe(
      map((num) => {
        const userOrder = 100 - num * 10;
        const totalWaiting = 100 + num * 13;
        const restMillisecond = 10000 - num * 1000;
        const enteringStatus = userOrder <= 0;

        return {
          data: {
            id: eventId,
            data: {
              'user-order': userOrder,
              'total-waiting': totalWaiting,
              'rest-millisecond': restMillisecond,
              'entering-status': enteringStatus,
            },
          },
        };
      }),

      takeWhile((response) => {
        return !response.data.data['entering-status'];
      }, true),
    );
  }
}
