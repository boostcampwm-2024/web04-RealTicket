import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { AppException } from '../../../common/exception/app.exception';
import { PlaceCreationDto } from '../dto/placeCreation.dto';
import { PlaceIdDto } from '../dto/placeId.dto';
import { SeatInfoDto } from '../dto/seatInfo.dto';
import { SectionCreationDto } from '../dto/sectionCreation.dto';
import { Place } from '../entity/place.entity';
import { PlaceErrorCode } from '../exception/place-error-code';
import { PlaceRepository } from '../repository/place.repository';
import { SectionRepository } from '../repository/section.repository';

@Injectable()
export class PlaceService {
  constructor(
    private readonly placeRepository: PlaceRepository,
    private readonly sectionRepository: SectionRepository,
    private readonly dataSource: DataSource,
  ) {}

  async getSeats(placeId: number): Promise<SeatInfoDto> {
    const place: Place = await this.placeRepository.selectPlace(placeId);

    if (!place) {
      throw new AppException(PlaceErrorCode.NOT_FOUND);
    }

    const sectionNameList = place.sections;
    const secitons = await Promise.all(
      sectionNameList.map(async (sectionName) => {
        return await this.sectionRepository.findById(parseInt(sectionName, 10));
      }),
    );

    return {
      id: place.id,
      layout: {
        overview: place.overviewSvg,
        sections: secitons,
        overviewWidth: place.overviewWidth,
        overviewHeight: place.overviewHeight,
        overviewPoints: place.overviewPoints,
      },
    };
  }

  async createPlace(placeCreationDto: PlaceCreationDto) {
    return await this.placeRepository.storePlace({
      ...placeCreationDto,
      sections: [],
    });
  }

  async createSections(sectionCreationDtoList: SectionCreationDto[], placeId: number) {
    const place = await this.placeRepository.selectPlace(placeId);
    if (!place) throw new AppException(PlaceErrorCode.NOT_FOUND);
    await this.dataSource.transaction(async () => {
      const sortedSectionDtos: SectionCreationDto[] = sectionCreationDtoList.sort(
        (a, b) => a.order - b.order,
      );
      const sections = [];
      for (const sectionElement of sortedSectionDtos) {
        const sectionEntity = await this.sectionRepository.storeSection({ ...sectionElement, place });
        sections.push(sectionEntity);
      }
      const sectionOrder = sections.map((section) => section.id.toString());
      await this.placeRepository.updateSectionsById(sectionOrder, placeId);
    });
  }

  async deletePlace({ placeId }: PlaceIdDto) {
    await this.placeRepository.deleteById(placeId);
  }
}
