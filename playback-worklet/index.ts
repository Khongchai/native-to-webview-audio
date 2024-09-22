import { CircularBuffer } from "./CircularBuffer";
import {
  CHANNEL_COUNT,
  CHUNK_SIZE,
  CIRCULAR_BUFFER_SIZE_IN_CHUNKS,
  SAMPLE_RATE,
  WEB_AUDIO_BLOCK_SIZE,
} from "./config";
import { Lock } from "./Lock";
import { MainThreadToPlaybackEvents } from "./protocol.type";
import { utils } from "./utils";

/**
 * A playback worklet. Some improved playback-related ideas and flow control from the vocoderworklet.
 *
 * For now just used for playing back the recording.
 */
class PlaybackWorklet extends AudioWorkletProcessor<"playback"> {
  // This can be lazily loaded with dynamic configurations via `request:prepare` if needed.
  private _buffer: CircularBuffer = new CircularBuffer({
    chunkSize: CHUNK_SIZE,
    circularBufferSizeInChunks: CIRCULAR_BUFFER_SIZE_IN_CHUNKS,
    channelCount: CHANNEL_COUNT,
    hopSize: WEB_AUDIO_BLOCK_SIZE,
  });
  private _isPaused = true;
  private _seekLock = new Lock(1);
  private _isClosed = false;
  /**
   * Initial pending chunk is 0 -- the first chunk before any playback is possible.
   */
  private _pendingChunk: number | null = 0;

  /**
   * For keeping track of which chunk to request to main.
   */
  private _currentChunk = 0;
  private _currentFrame = 0;
  private _currentSecond = 0;
  /**
   * Audio duration in seconds.
   */
  private _duration = 0;

  public constructor() {
    super();

    this.port.onmessage = this._handleMessage.bind(this);

    this._maybeRequestMore();
  }

  private async _handleMessage(e: { data: MainThreadToPlaybackEvents }) {
    switch (e.data.type) {
      case "request:pause": {
        this._isPaused = true;
        this.port.postMessage({
          type: "response:paused",
        });
        return;
      }

      case "request:play": {
        this._isPaused = false;
        return;
      }

      case "request:prepare": {
        this._isClosed = false;
        this._duration = e.data.duration;
        return;
      }

      case "request:seek": {
        console.info(`Playback worklet seeking to ${e.data.seconds}`);
        this._currentSecond = e.data.seconds;
        this._currentFrame = utils.secondToFrame(
          this._currentSecond,
          SAMPLE_RATE,
          WEB_AUDIO_BLOCK_SIZE
        );
        const chunkToRequest = Math.floor(this._currentFrame / CHUNK_SIZE);
        this._currentChunk = chunkToRequest - 1;
        this._buffer.setWritePointer(this._currentFrame);
        this._seekLock.lock();
        this._reportPosition();
        this._maybeRequestMore(true); // should result in a request:nextChunk, otherwise this is a deadlock.
        return;
      }

      case "request:stop": {
        this._isClosed = true;
        this._isPaused = true;
        this._currentChunk = 0;
        this._currentFrame = 0;
        this._currentSecond = 0;
        this._pendingChunk = 0;
        this._buffer.clear();
        return;
      }

      case "response:nextChunk": {
        if (this._pendingChunk !== e.data.chunkIndex) {
          console.warn(
            `Received chunk ${e.data.chunkIndex} but was expecting ${this._pendingChunk}`
          );
          return;
        }
        this._pendingChunk = null;
        this._currentChunk = e.data.chunkIndex;

        // assume only one input
        const firstInput = e.data.chunks[0];
        this._buffer.receive(firstInput);

        if (this._seekLock.isLocked) {
          this._seekLock.attemptUnlock();
          if (!this._seekLock.isLocked) {
            console.info("Seeking done.");
          }
        }

        return;
      }
    }
  }

  public override process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][]
  ): boolean {
    if (this._isPaused || this._isClosed || this._seekLock.isLocked) {
      return true;
    }

    if (this._hasReachedEnd()) {
      this._isPaused = true;
      this._signalEnd();
      return true;
    }

    const peeked = this._buffer.peek(this._currentFrame);

    this._singleInputCopy(peeked, outputs[0]);

    this._forwardPosition();

    this._reportPosition();

    this._maybeRequestMore();

    return true;
  }

  private _hasReachedEnd() {
    return this._currentSecond >= this._duration;
  }

  private _forwardPosition() {
    this._currentSecond = utils.frameToSecond(
      ++this._currentFrame,
      SAMPLE_RATE,
      WEB_AUDIO_BLOCK_SIZE
    );
  }

  private _reportPosition() {
    this.port.postMessage({
      type: "position:report",
      positionAsSeconds: this._currentSecond,
    });
  }

  private _signalEnd() {
    this.port.postMessage({
      type: "signal:end",
    });
  }

  private _maybeRequestMore(forced?: boolean) {
    if (
      !forced &&
      (utils.isNotNullish(this._pendingChunk) ||
        !this._buffer.readAboutToOvertakeWrite(this._currentFrame))
    ) {
      return;
    }
    this._pendingChunk = this._currentChunk + 1;
    console.info(`Playbackworklet requesting chunk ${this._pendingChunk}`);
    this.port.postMessage({
      type: "request:nextChunk",
      chunkIndex: this._pendingChunk,
    });
  }

  private _singleInputCopy(
    inputs: Float32Array[],
    outputs: Float32Array[]
  ): void {
    for (let channel = 0; channel < outputs.length; channel++) {
      outputs[channel].set(inputs[channel]);
    }
  }
}

registerProcessor("playback", PlaybackWorklet);
