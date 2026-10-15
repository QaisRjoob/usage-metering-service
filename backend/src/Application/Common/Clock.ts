/** Source of "now". Injected so tests can simulate month boundaries. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
