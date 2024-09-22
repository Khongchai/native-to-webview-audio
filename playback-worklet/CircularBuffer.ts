import { READ_WRITE_POINTER_DISTANCE } from "./config";

type Buffer = Channel[];
type Channel = Bucket[];
type Bucket = Float32Array;

/**
 * A single-input circular buffer.
 *
 * Create as many instances of this class as the number of inputs you have.
 *
 * This buffer helps manage the write pointer. I'm using the audio thread's currentFrame as the write pointer, hence
 * its absence from this class.
 *
 * This circular buffer can be visualized like this
 *
 * ```
 * _buffer = [
 *     [  // channel 1
 *        // ...
 *     ],
 *      [ // channel 2
 *          [ // bucket1
 *              ...hop
 *          ],
 *          bucket2,
 *          bucket3,
 *          bucket4
 *      ]
 * ]
 * ```
 *
 * A buffer holds a number of channels. Each channel holds a number of buckets. Each bucket represents a `hop` of `Float32Array` data.
 */
export class CircularBuffer {
  private readonly _buffer: Buffer;

  private _bucketWritePointer = 0;

  private readonly _channelCount: number;
  /**
   * This is usually 128, the audio worklet size.
   */
  private readonly _hopSize: number;
  /**
   * The number of buckets in the buffer.
   */
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

  /**
   * When we read from this buffer, we convert the current hop to a bucket position and read from all channels at that position.
   */
  public peek(setHop: number): Float32Array[] {
    const readPos = this._hopToPositionPointer(setHop);
    return this._buffer.map((b) => b[readPos]);
  }

  /**
   * Receive data adds the data to the buffer in a circular fashion.
   *
   * The write pointer is forwarded by the appropriate number of buckets.
   */
  public receive(data: Float32Array[]) {
    if (data.length != this._channelCount) {
      console.error("Channel length mismatch, cannot receive.");
      return;
    }

    const correctChunkSize = data[0].length / this._hopSize === this._chunkSize;
    if (!correctChunkSize) {
      console.error("Chunk size mismatch, cannot receive.");
      return;
    }

    let currentBucket = this._bucketWritePointer;
    let channel = 0;
    for (let j = 0; j < this._chunkSize; j++) {
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
    // Find out whether read is about to overtake write by a certain distance.
    // Let's say the total size is 10, read is 0 and write is 9, the linear distance here is `write - read`.
    //
    // However, because ours is a circular one, so we need to take into account the circular distance using mod operator.
    // Let's say the total size is 10, read is 10 and write is 2, the distance here is 2. But `read - write` is -8. We need
    // to `unwrap` this distance by adding the total size to it. So the equation becomes `(write - read + totalSize) % totalSize`.
    //
    // The % totalSize at the end is I think not necessary, but I added it for good measure.
    return (
      (this._bucketWritePointer -
        this._hopToPositionPointer(currentHop) +
        this._bucketsCount) %
        this._bucketsCount <
      READ_WRITE_POINTER_DISTANCE
    );
  }

  /**
   * Allows the write pointer to be set to a specific hop position.
   */
  public setWritePointer(hopPosition: number) {
    // We must first find out in which `chunk` the hop is, then set the write pointer to the start of that chunk.
    // Without this step, the write pointer will be set to the hop position instead and when you seek,
    // the audio will be written to the wrong bucket. This will cause a certain set of audio region to output
    // the same audio data, corresponding to the size of your chunk.
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
