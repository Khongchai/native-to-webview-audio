export const utils = {
  secondToFrame(seconds: number, sampleRate: number, chunkSize: number) {
    return (seconds * sampleRate) / chunkSize;
  },

  frameToSecond(
    currentFrame: number,
    sampleRate: number,
    hopSize: number
  ): number {
    return (currentFrame * hopSize) / sampleRate;
  },

  /**
   * not null && not undefined
   */
  isNotNullish<T>(value: T): value is NonNullable<T> {
    return value != null;
  },
};
