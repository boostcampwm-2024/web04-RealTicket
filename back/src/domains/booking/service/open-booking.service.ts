import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import Redis from 'ioredis';

import { Event } from '../../event/entity/event.entity';
import { EventRepository } from '../../event/repository/event.reposiotry';
import { SectionRepository } from '../../place/repository/section.repository';
import { ONE_MINUTE_BEFORE_THE_HOUR } from '../const/cronExpressions.const';
import { IN_BOOKING_DEFAULT_MAX_SIZE } from '../const/inBookingDefaultMaxSize.const';

import { BookingSeatsService } from './booking-seats.service';
import { EnterBookingService } from './enter-booking.service';
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
    private enterBookingService: EnterBookingService,
    private schedulerRegistry: SchedulerRegistry,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  async onApplicationBootstrap() {
    await this.inBookingService.setInBookingSessionsDefaultMaxSize(IN_BOOKING_DEFAULT_MAX_SIZE);
    await this.scheduleUpcomingReservations();
  }

  @Cron(ONE_MINUTE_BEFORE_THE_HOUR)
  async scheduleUpcomingReservations() {
    const comingEvents = await this.eventRepository.selectUpcomingEvents();
    const openedEventIds = new Set(await this.getOpenedEventIds());
    const now = new Date();
    const eventToOpen = comingEvents.filter((event) => event.reservationOpenDate <= now);
    const eventsToSchedule = comingEvents.filter(
      (event) => !openedEventIds.has(event.id) && event.reservationOpenDate > now,
    );

    for (const event of eventToOpen) {
      await this.openReservation(event);
    }
    for (const event of eventsToSchedule) {
      this.scheduleReservationOpen(event);
    }
  }

  private scheduleReservationOpen(event: Event) {
    const jobName = `reservation-open-${event.id}`;

    if (this.schedulerRegistry.doesExist('cron', jobName)) {
      this.schedulerRegistry.deleteCronJob(jobName);
    }

    const job = new CronJob(event.reservationOpenDate, async () => {
      await this.openReservationById(event.id);
    });

    this.schedulerRegistry.addCronJob(jobName, job);
    job.start();
  }

  async isEventOpened(eventId: number) {
    return (await this.redis.get(`open-booking:${eventId}:opened`)) === 'true';
  }

  async getOpenedEventIds() {
    const keys = await this.redis.keys('open-booking:*:opened');
    const eventIds = keys.map((key) => parseInt(key.split(':')[1]));
    return eventIds;
  }

  private async openReservationById(eventId: number) {
    const event = await this.eventRepository.selectEvent(eventId);
    await this.openReservation(event);
  }

  private async openReservation(event: Event) {
    this.validateOpeningEvent(event);

    const eventId = event.id;
    const place = await event.place;
    const sections = await Promise.all(
      place.sections.map((sectionId) => this.sectionRepository.selectSection(parseInt(sectionId))),
    );

    const defaultMaxSize = await this.inBookingService.getInBookingSessionsDefaultMaxSize();
    await this.inBookingService.setInBookingSessionsMaxSize(eventId, defaultMaxSize);

    const initialSeats = sections.map((section) => section.seats);
    await this.seatsUpdateService.openReservation(eventId, initialSeats);

    await this.enterBookingService.gcEnteringSessions(eventId);

    await this.registerOpenedEvent(eventId);
  }

  private validateOpeningEvent(event: Event) {
    if (!event) {
      return false;
    }

    const openTime = event.reservationOpenDate;
    if (openTime > new Date()) {
      const jobName = `reservation-open-${event.id}`;
      const job = new CronJob(openTime, async () => {
        await this.openReservationById(event.id);
      });
      this.schedulerRegistry.addCronJob(jobName, job);
      job.start();
      return false;
    }

    return true;
  }

  private async registerOpenedEvent(eventId: number) {
    await this.redis.set(`open-booking:${eventId}:opened`, 'true');
  }
}
