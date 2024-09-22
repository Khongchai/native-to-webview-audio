import { READ_WRITE_POINTER_DISTANCE } from "./config";

type Buffer = Channel[];
type Channel = Bucket[];
type Bucket = Float32Array;

/**
 * A single-input circular buffer.
 *
 * Create as many instances of this class as the number of inputs you have.
 */
export class CircularBuffer {
  private readonly _buffer: Buffer;

  private _bucketWritePointer = 0;

  private readonly _channelCount: number;
  private readonly _hopSize: number;
  private readonly _bucketsCount: number;
  private readonly _chunkSize: number;

  public constructor({
    chunkSize,
    circularBufferSizeInChunks,
    channelCount,
    hopSize,
  }: {
    /**
     * The size of chunks in hops
     */
    chunkSize: number;
    /**
     * How many chunks of `chunkSize` to store in the circular buffer.
     */
    circularBufferSizeInChunks: number;
    channelCount: number;
    hopSize: number;
  }) {
    this._chunkSize = chunkSize;
    this._hopSize = hopSize;
    this._channelCount = channelCount;

    this._bucketsCount = this._chunkSize * circularBufferSizeInChunks;
    const buildBucket = () => {
      return Array.from(
        { length: this._bucketsCount },
        () => new Float32Array(this._hopSize)
      );
    };
    this._buffer = Array.from({ length: channelCount }, buildBucket.bind(this));
  }

  public peek(setHop: number): Float32Array[] {
    const readPos = this._hopToPositionPointer(setHop);
    return this._buffer.map((b) => b[readPos]);
  }

  public receive(data: Float32Array[]) {
    if (data.length != this._channelCount) {
      console.error("Channel length mismatch, cannot receive.");
      return;
    }

    const forwardCount = data[0].length / this._hopSize;
    if (Math.round(forwardCount) !== forwardCount) {
      console.error("data length should be divisible by forward count");
      return;
    }

    let currentBucket = this._bucketWritePointer;
    let channel = 0;
    for (let j = 0; j < forwardCount; j++) {
      for (channel = 0; channel < this._channelCount; channel++) {
        this._buffer[channel][currentBucket].set(
          data[channel].subarray(j * this._hopSize, (j + 1) * this._hopSize)
        );
      }
      currentBucket = (currentBucket + 1) % this._bucketsCount;
    }

    this._bucketWritePointer = currentBucket;
  }

  public readAboutToOvertakeWrite(currentHop: number) {
    return (
      (this._bucketWritePointer -
        this._hopToPositionPointer(currentHop) +
        this._bucketsCount) %
        this._bucketsCount <
      READ_WRITE_POINTER_DISTANCE
    );
  }

  public setWritePointer(hopPosition: number) {
    const correctBucket =
      Math.floor(hopPosition / this._chunkSize) * this._chunkSize;
    this._bucketWritePointer = this._hopToPositionPointer(correctBucket);
  }

  public clear() {
    this._bucketWritePointer = 0;
  }

  private _hopToPositionPointer(hopPosition: number) {
    // Floor because we want to round down to the nearest bucket (the bucket that contains the hop)
    return Math.floor(hopPosition % this._bucketsCount);
  }
}
