import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { Event } from '../../event/entity/event.entity';
import { EventRepository } from '../../event/repository/event.reposiotry';
import { SectionRepository } from '../../place/repository/section.repository';

import { BookingSeatsService } from './booking-seats.service';

@Injectable()
export class OpenBookingService implements OnApplicationBootstrap {
  constructor(
    private eventRepository: EventRepository,
    private sectionRepository: SectionRepository,
    private seatsUpdateService: BookingSeatsService,
  ) {}

  async onApplicationBootstrap() {
    await this.checkAndOpenReservations();
  }

  @Cron(CronExpression.EVERY_HOUR)
  private async checkAndOpenReservations() {
    const events = await this.eventRepository.selectEvents();
    const eventsToOpen = events.filter((event) => {
      const now = new Date();
      return event.reservationOpenDate <= now;
    });
    await Promise.all(eventsToOpen.map((event) => this.openReservation(event)));
  }

  private async openReservation(event: Event) {
    const eventId = event.id;
    const place = await event.place;
    const sections = await Promise.all(
      place.sections.map((sectionId) => this.sectionRepository.selectSection(parseInt(sectionId))),
    );
    const seats = sections.map((section) => section.seats.map((seat) => parseBooleanString(seat)));
    await this.seatsUpdateService.openReservation(eventId, seats);
  }
}

const parseBooleanString = (str: string): boolean => {
  return str === 'true';
};
