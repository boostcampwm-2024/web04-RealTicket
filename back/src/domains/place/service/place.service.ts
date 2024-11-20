import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { PlaceCreationDto } from '../dto/placeCreation.dto';
import { SeatInfoDto } from '../dto/seatInfo.dto';
import { SectionCreationDto } from '../dto/sectionCreation.dto';
import { Place } from '../entity/place.entity';
import { PlaceRepository } from '../repository/place.repository';
import { SectionRepository } from '../repository/section.repository';

@Injectable()
export class PlaceService {
  private readonly logger = new Logger(PlaceService.name);

  constructor(
    private readonly placeRepository: PlaceRepository,
    private readonly sectionRepository: SectionRepository,
    private readonly dataSource: DataSource,
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

  async createPlace(placeCreationDto: PlaceCreationDto) {
    this.placeRepository.storePlace({
      ...placeCreationDto,
      sections: [],
    });
  }

  async createSections(sectionCreationDtoList: SectionCreationDto[], placeId: number) {
    const place = await this.placeRepository.selectPlace(placeId);
    if (!place) throw new NotFoundException(`해당 장소[${placeId}]가 존재하지 않습니다.`);
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
}
