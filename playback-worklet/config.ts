// The total memory usage of the CircularBuffer = WEB_AUDIO_BLOCK_SIZE * channelCount * chunkSize * circularBufferSizeInChunks * (bitsPerSample / 8)

export const WEB_AUDIO_BLOCK_SIZE = 128;
/**
 * This must be tuned properly because this affects the time it takes for the chunks to be
 * stringified, sent to webview, and de-serialized back to bytes.
 */
export const CHUNK_SIZE = 200;

/**
 * The size of the circular buffer that holds the audio data.
 *
 * Bumping  this number up significantly affects the memory usage of the app.
 */
export const CIRCULAR_BUFFER_SIZE_IN_CHUNKS = 10;

export const CHANNEL_COUNT = 2;

export const SAMPLE_RATE = 44100;

/**
 * Distance between the read and write pointers.
 *
 * If the distance is too small, the read pointer will catch up to the write pointer and thus
 * we should request more chunks from the main thread.
 */
export const READ_WRITE_POINTER_DISTANCE = 5 * CHUNK_SIZE;
