export const IN_BOOKING_DEFAULT_MAX_SIZE =
  process.env.DEVELOPING_WAITING_QUEUE_MODE === 'true'
    ? 1
    : process.env.INFINITE_IN_BOOKING_POOL_SIZE === 'true'
      ? 2100000000
      : 100;
