import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

import { SeatInfoDto } from '../dto/seatInfo.dto';
import { Place } from '../entity/place.entity';
import { PlaceRepository } from '../repository/place.repository';
import { SectionRepository } from '../repository/section.repository';

@Injectable()
export class PlaceService {
  private readonly logger = new Logger(PlaceService.name);

  constructor(
    private readonly placeRepository: PlaceRepository,
    private readonly sectionRepository: SectionRepository,
  ) {}

  async getSeats(placeId: number): Promise<SeatInfoDto> {
    try {
      const place: Place = await this.placeRepository.selectPlace(placeId);
      console.log(place);
      const sectionNameList = place.sections;
      const secitons = await Promise.all(
        sectionNameList.map(async (sectionName) => {
          return await this.sectionRepository.findByName(sectionName);
        }),
      );

      if (!place) {
        throw new BadRequestException('해당 장소가 존재하지 않습니다.');
      }

      return {
        id: place.id,
        layout: {
          overview: place.overviewSvg,
          sections: secitons,
        },
      };
    } catch (err) {
      this.logger.error(err);
      throw new InternalServerErrorException('서버 오류 발생');
    }
  }
}
