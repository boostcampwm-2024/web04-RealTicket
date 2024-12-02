import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import Redis from 'ioredis';

import { AuthService } from '../../../auth/service/auth.service';
import { Event } from '../../event/entity/event.entity';
import { EventRepository } from '../../event/repository/event.reposiotry';
import { SectionRepository } from '../../place/repository/section.repository';
import { UserService } from '../../user/service/user.service';
import { ONE_MINUTE_BEFORE_THE_HOUR } from '../const/cronExpressions.const';
import { IN_BOOKING_DEFAULT_MAX_SIZE } from '../const/inBookingDefaultMaxSize.const';

import { BookingSeatsService } from './booking-seats.service';
import { EnterBookingService } from './enter-booking.service';
import { InBookingService } from './in-booking.service';
import { WaitingQueueService } from './waiting-queue.service';

@Injectable()
export class OpenBookingService implements OnApplicationBootstrap {
  private readonly redis: Redis | null;

  constructor(
    private redisService: RedisService,
    private eventRepository: EventRepository,
    private sectionRepository: SectionRepository,
    private authService: AuthService,
    private userService: UserService,
    private inBookingService: InBookingService,
    private seatsUpdateService: BookingSeatsService,
    private waitingQueueService: WaitingQueueService,
    private enterBookingService: EnterBookingService,
    private schedulerRegistry: SchedulerRegistry,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  async onApplicationBootstrap() {
    await this.inBookingService.setInBookingSessionsDefaultMaxSize(IN_BOOKING_DEFAULT_MAX_SIZE);
    await this.scheduleUpcomingReservations();
  }

  async initReservation(eventId: number) {
    await this.closeReservationAnyway(eventId);
    await this.openReservationById(eventId);
  }

  @Cron(ONE_MINUTE_BEFORE_THE_HOUR)
  async scheduleUpcomingReservations() {
    const comingEvents = await this.eventRepository.selectUpcomingEvents();
    await this.scheduleUpcomingReservationsToOpen(comingEvents);
    await this.scheduleUpcomingReservationsToClose(comingEvents);
  }

  private async scheduleUpcomingReservationsToOpen(comingEvents: Event[]) {
    const now = new Date();
    const openedEventIds = new Set(await this.getOpenedEventIds());
    const eventToOpen = comingEvents.filter(
      (event) => !openedEventIds.has(event.id) && event.reservationOpenDate <= now,
    );
    const eventsToScheduleOpen = comingEvents.filter(
      (event) => !openedEventIds.has(event.id) && event.reservationOpenDate > now,
    );

    for (const event of eventToOpen) {
      await this.openReservation(event);
    }
    for (const event of eventsToScheduleOpen) {
      this.scheduleReservationOpen(event);
    }
  }

  private async scheduleUpcomingReservationsToClose(comingEvents: Event[]) {
    const now = new Date();
    const eventsToScheduleClose = comingEvents.filter((event) => event.reservationCloseDate > now);

    for (const event of eventsToScheduleClose) {
      this.scheduleReservationClose(event);
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

  private scheduleReservationClose(event: Event) {
    const jobName = `reservation-close-${event.id}`;

    if (this.schedulerRegistry.doesExist('cron', jobName)) {
      this.schedulerRegistry.deleteCronJob(jobName);
    }

    const job = new CronJob(event.reservationCloseDate, async () => {
      await this.closeReservation(event.id);
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
      this.scheduleReservationOpen(event);
      return false;
    }
    return true;
  }

  private async registerOpenedEvent(eventId: number) {
    await this.redis.set(`open-booking:${eventId}:opened`, 'true');
  }

  async closeReservationAnyway(eventId: number) {
    await this.unlinkOpenedEvent(eventId);
    await this.clearWaitingService(eventId);
    await this.clearEnteringService(eventId);
    await this.seatsUpdateService.clearSeatsSubscription(eventId);
    await this.clearInBookingService(eventId);
  }

  async closeReservation(eventId: number) {
    await this.validateClosingEvent(eventId);
    await this.unlinkOpenedEvent(eventId);
    await this.clearWaitingService(eventId);
    await this.clearEnteringService(eventId);
    await this.seatsUpdateService.clearSeatsSubscription(eventId);
    await this.clearInBookingService(eventId);
  }

  private async validateClosingEvent(eventId: number) {
    const event = await this.eventRepository.selectEvent(eventId);
    if (!event) {
      return false;
    }
    const closeTime = event.reservationCloseDate;
    if (closeTime > new Date()) {
      this.scheduleReservationClose(event);
      return false;
    }
    return true;
  }

  private async clearWaitingService(eventId: number) {
    const waitingSids = await this.waitingQueueService.getAllWaitingSids(eventId);
    for (const sid of waitingSids) {
      await this.resetUserStatus(sid);
    }
    await this.waitingQueueService.clearQueue(eventId);
  }

  private async clearEnteringService(eventId: number) {
    const enteringSids = await this.enterBookingService.getAllEnteringSids(eventId);
    for (const sid of enteringSids) {
      await this.resetUserStatus(sid);
    }
    await this.enterBookingService.clearEnteringPool(eventId);
  }

  private async clearInBookingService(eventId: number) {
    const inBookingSids = await this.inBookingService.getAllInBookingSids(eventId);
    for (const sid of inBookingSids) {
      await this.resetUserStatus(sid);
    }
    await this.inBookingService.clearInBookingPool(eventId);
  }

  private async resetUserStatus(sid: string) {
    const authSession = await this.authService.getUserSession(sid);
    if (authSession) {
      await this.authService.setUserStatusLogin(sid);
      await this.userService.setUserEventTarget(sid, 0);
    }
  }

  private async unlinkOpenedEvent(eventId: number) {
    await this.redis.unlink(`open-booking:${eventId}:opened`);
  }
}
