import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';

import { Event } from '../../event/entity/event.entity';
import { EventRepository } from '../../event/repository/event.reposiotry';
import { SectionRepository } from '../../place/repository/section.repository';
import { IN_BOOKING_DEFAULT_MAX_SIZE } from '../const/inBookingDefaultMaxSize.const';

import { BookingSeatsService } from './booking-seats.service';
import { InBookingService } from './in-booking.service';

@Injectable()
export class OpenBookingService implements OnApplicationBootstrap {
  private readonly redis: Redis | null;

  constructor(
    private redisService: RedisService,
    private eventRepository: EventRepository,
    private sectionRepository: SectionRepository,
    private inBookingService: InBookingService,
    private seatsUpdateService: BookingSeatsService,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  async onApplicationBootstrap() {
    await this.inBookingService.setInBookingSessionsDefaultMaxSize(IN_BOOKING_DEFAULT_MAX_SIZE);
    await this.checkAndOpenReservations();
  }

  @Cron(CronExpression.EVERY_HOUR)
  private async checkAndOpenReservations() {
    const events = await this.eventRepository.selectEvents();
    const openedEventIds = new Set(await this.getOpenedEventIds());
    const eventsToOpen = events.filter((event) => {
      const now = new Date();
      return event.reservationOpenDate <= now && !openedEventIds.has(event.id);
    });
    await Promise.all(eventsToOpen.map((event) => this.openReservation(event)));
  }

  async isEventOpened(eventId: number) {
    return (await this.redis.get(`open-booking:${eventId}:opened`)) === 'true';
  }

  async getOpenedEventIds() {
    const keys = await this.redis.keys('open-booking:*:opened');
    const eventIds = keys.map((key) => parseInt(key.split(':')[2]));
    return eventIds;
  }

  private async openReservation(event: Event) {
    const eventId = event.id;
    const place = await event.place;
    const sections = await Promise.all(
      place.sections.map((sectionId) => this.sectionRepository.selectSection(parseInt(sectionId))),
    );

    const defaultMaxSize = await this.inBookingService.getInBookingSessionsDefaultMaxSize();
    await this.inBookingService.setInBookingSessionsMaxSize(eventId, defaultMaxSize);

    const initialSeats = sections.map((section) => section.seats);
    await this.seatsUpdateService.openReservation(eventId, initialSeats);

    await this.registerOpenedEvent(eventId);
  }

  private async registerOpenedEvent(eventId: number) {
    await this.redis.set(`open-booking:${eventId}:opened`, 'true');
  }
}
