import { CircularBuffer } from "./CircularBuffer";
import {
  CHANNEL_COUNT,
  CHUNK_SIZE,
  CIRCULAR_BUFFER_SIZE_IN_CHUNKS,
  SAMPLE_RATE,
  WEB_AUDIO_BLOCK_SIZE,
} from "./config";
import { Lock } from "./Lock";
import type {
  MainThreadToPlaybackEvents,
  PlaybackWorkletPort,
} from "./protocol.type";
import { utils } from "./utils";

type AudioWorkletProcessorType = "playback";

declare global {
  class AudioWorkletProcessor<T extends AudioWorkletProcessorType> {
    port: T extends "playback" ? PlaybackWorkletPort : unknown;
    process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
  }

  function registerProcessor<T extends AudioWorkletProcessorType>(
    name: T,
    processorCtor: new () => AudioWorkletProcessor<T>
  ): void;
}

class PlaybackWorklet extends AudioWorkletProcessor<"playback"> {
  // This can be lazily loaded with dynamic configurations via `request:prepare` if needed.
  private _buffer: CircularBuffer = new CircularBuffer({
    chunkSize: CHUNK_SIZE,
    circularBufferSizeInChunks: CIRCULAR_BUFFER_SIZE_IN_CHUNKS,
    channelCount: CHANNEL_COUNT,
    hopSize: WEB_AUDIO_BLOCK_SIZE,
  });
  private _isPaused = true;
  private _seekLock = new Lock();
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

    // Immediately request the first chunk.
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
        this.port.postMessage({
          type: "response:played",
        });
        return;
      }

      case "request:prepare": {
        this._isClosed = false;
        this._duration = e.data.duration;
        this.port.postMessage({
          type: "response:prepared",
        });
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
        this.port.postMessage({
          type: "response:stopped",
        });
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

        // assume only one input for now.
        const firstInput = e.data.chunks[0];

        this._buffer.receive(firstInput);

        if (this._seekLock.isLocked) {
          this._seekLock.unlock();
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

    // You can build on top of this and perform any processing here.
    // This example just copies the input to the output, using this as a simple audio out.
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
    this._currentFrame++;
    this._currentSecond = utils.frameToSecond(
      this._currentFrame,
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
      // We can force this to request more chunks if needed. For example, after seeking.
      !forced &&
      // IF we already have a pending chunk, no need to request again.
      (utils.isNotNullish(this._pendingChunk) ||
        // If the buffer is not about to overtake the write pointer, no need to request.
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

    // Set a timeout to handle potential network issues
    setTimeout(() => {
      if (this._pendingChunk === this._currentChunk + 1) {
        console.warn(`Chunk request timeout for chunk ${this._pendingChunk}`);
        this._pendingChunk = null;
        this._maybeRequestMore(true);
      }
    }, 5000); // 5 second timeout, adjust as needed
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
