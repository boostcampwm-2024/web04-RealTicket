import Redis from 'ioredis';

type InBookingSessionRawResult = Array<string>;

type InBookingSessionRecord = {
  sid: string;
  bookingAmount: number;
  bookedSeats: [number, number][];
  saved: boolean;
  subscribedSection: number | null;
};

type RedisWithInBookingSessionCommands = Redis & {
  addInBookingBookedSeat?: (
    inBookingSessionsKey: string,
    sid: string,
    sectionIndex: string,
    seatIndex: string,
    enforceQuota: string,
  ) => Promise<InBookingSessionRawResult>;
  removeInBookingBookedSeat?: (
    inBookingSessionsKey: string,
    sid: string,
    sectionIndex: string,
    seatIndex: string,
    requireBooked: string,
  ) => Promise<InBookingSessionRawResult>;
  flushInBookingBookedSeats?: (
    inBookingSessionsKey: string,
    sid: string,
    setBookingAmount: string,
    bookingAmount: string,
    onlyWhenUnsaved: string,
  ) => Promise<InBookingSessionRawResult>;
  setInBookingSaved?: (
    inBookingSessionsKey: string,
    sid: string,
    saved: string,
  ) => Promise<InBookingSessionRawResult>;
  setInBookingSubscribedSection?: (
    inBookingSessionsKey: string,
    sid: string,
    hasSection: string,
    sectionIndex: string,
  ) => Promise<InBookingSessionRawResult>;
};

async function readSession(
  redis: Redis,
  inBookingSessionsKey: string,
  sid: string,
): Promise<InBookingSessionRecord | null> {
  const raw = await redis.hget(inBookingSessionsKey, sid);
  return raw ? (JSON.parse(raw) as InBookingSessionRecord) : null;
}

async function writeSession(
  redis: Redis,
  inBookingSessionsKey: string,
  sid: string,
  session: InBookingSessionRecord,
): Promise<void> {
  await redis.hset(inBookingSessionsKey, sid, JSON.stringify(session));
}

function findSeatIndex(seats: [number, number][], sectionIndex: number, seatIndex: number): number {
  return seats.findIndex((seat) => seat[0] === sectionIndex && seat[1] === seatIndex);
}

async function emulateAddBookedSeat(
  redis: Redis,
  inBookingSessionsKey: string,
  sid: string,
  sectionIndex: string,
  seatIndex: string,
  enforceQuota: string,
): Promise<InBookingSessionRawResult> {
  const session = await readSession(redis, inBookingSessionsKey, sid);
  if (!session) {
    return ['SESSION_NOT_FOUND'];
  }

  if (enforceQuota === '1' && session.bookingAmount <= session.bookedSeats.length) {
    return ['QUOTA_EXCEEDED'];
  }

  session.bookedSeats.push([Number(sectionIndex), Number(seatIndex)]);
  await writeSession(redis, inBookingSessionsKey, sid, session);

  return ['OK'];
}

async function emulateRemoveBookedSeat(
  redis: Redis,
  inBookingSessionsKey: string,
  sid: string,
  sectionIndex: string,
  seatIndex: string,
  requireBooked: string,
): Promise<InBookingSessionRawResult> {
  const mustBeBooked = requireBooked === '1';
  const session = await readSession(redis, inBookingSessionsKey, sid);
  if (!session) {
    return mustBeBooked ? ['CANCEL_EMPTY'] : ['SESSION_NOT_FOUND'];
  }

  if (mustBeBooked && session.bookedSeats.length === 0) {
    return ['CANCEL_EMPTY'];
  }

  const foundIndex = findSeatIndex(session.bookedSeats, Number(sectionIndex), Number(seatIndex));
  if (foundIndex < 0) {
    return mustBeBooked ? ['SEAT_NOT_BOOKED'] : ['OK'];
  }

  session.bookedSeats.splice(foundIndex, 1);
  await writeSession(redis, inBookingSessionsKey, sid, session);

  return ['OK'];
}

async function emulateFlushBookedSeats(
  redis: Redis,
  inBookingSessionsKey: string,
  sid: string,
  setBookingAmount: string,
  bookingAmount: string,
  onlyWhenUnsaved: string,
): Promise<InBookingSessionRawResult> {
  const session = await readSession(redis, inBookingSessionsKey, sid);
  if (!session) {
    return ['SESSION_NOT_FOUND', '[]'];
  }

  if (onlyWhenUnsaved === '1' && session.saved) {
    return ['OK', '[]'];
  }

  const flushedSeats = JSON.stringify(session.bookedSeats);
  session.bookedSeats = [];

  if (setBookingAmount === '1') {
    session.bookingAmount = Number(bookingAmount);
  }

  await writeSession(redis, inBookingSessionsKey, sid, session);

  return ['OK', flushedSeats];
}

async function emulateSetInBookingSaved(
  redis: Redis,
  inBookingSessionsKey: string,
  sid: string,
  saved: string,
): Promise<InBookingSessionRawResult> {
  const session = await readSession(redis, inBookingSessionsKey, sid);
  if (!session) {
    return ['SESSION_NOT_FOUND'];
  }

  session.saved = saved === '1';
  await writeSession(redis, inBookingSessionsKey, sid, session);

  return ['OK'];
}

async function emulateSetSubscribedSection(
  redis: Redis,
  inBookingSessionsKey: string,
  sid: string,
  hasSection: string,
  sectionIndex: string,
): Promise<InBookingSessionRawResult> {
  const session = await readSession(redis, inBookingSessionsKey, sid);
  if (!session) {
    return ['SESSION_NOT_FOUND'];
  }

  session.subscribedSection = hasSection === '1' ? Number(sectionIndex) : null;
  await writeSession(redis, inBookingSessionsKey, sid, session);

  return ['OK'];
}

export function installInBookingSessionCommandMock(redis: Redis): void {
  const commandRedis = redis as RedisWithInBookingSessionCommands;
  const originalDefineCommand = redis.defineCommand.bind(redis);

  redis.defineCommand = function defineCommand(name: string, options: unknown) {
    if (name === 'addInBookingBookedSeat') {
      commandRedis.addInBookingBookedSeat = (...args) => emulateAddBookedSeat(redis, ...args);
      return redis;
    }

    if (name === 'removeInBookingBookedSeat') {
      commandRedis.removeInBookingBookedSeat = (...args) => emulateRemoveBookedSeat(redis, ...args);
      return redis;
    }

    if (name === 'flushInBookingBookedSeats') {
      commandRedis.flushInBookingBookedSeats = (...args) => emulateFlushBookedSeats(redis, ...args);
      return redis;
    }

    if (name === 'setInBookingSaved') {
      commandRedis.setInBookingSaved = (...args) => emulateSetInBookingSaved(redis, ...args);
      return redis;
    }

    if (name === 'setInBookingSubscribedSection') {
      commandRedis.setInBookingSubscribedSection = (...args) => emulateSetSubscribedSection(redis, ...args);
      return redis;
    }

    return originalDefineCommand(name, options as never);
  } as typeof redis.defineCommand;
}
