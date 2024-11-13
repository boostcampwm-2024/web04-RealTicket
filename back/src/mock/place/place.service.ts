import { Injectable } from '@nestjs/common';

@Injectable()
export class PlaceService {
  async getSeatsByPlaceId() {
    return {
      id: 1,
      layout: {
        overview: null,
        sections: [
          {
            id: 1,
            name: 'A구역',
            view: null,
            seats: [
              true,
              true,
              true,
              true,
              true,
              true,
              true,
              true,
              true,
              true,
              true,
              true,
              true,
              true,
              true,
              true,
              true,
              true,
              true,
              true,
            ],
            'col-len': 5,
          },
          {
            id: 2,
            name: 'B구역',
            view: null,
            seats: [
              true,
              true,
              false,
              true,
              true,
              true,
              true,
              false,
              true,
              true,
              true,
              true,
              false,
              true,
              true,
              true,
              true,
              false,
              true,
              true,
            ],
            'col-len': 5,
          },
        ],
      },
    };
  }
}
