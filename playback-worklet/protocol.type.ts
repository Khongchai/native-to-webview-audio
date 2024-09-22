export type PlaybackToMainThreadEvents =
  | {
      type: "request:nextChunk";
      chunkIndex: number;
    }
  | {
      type: "position:report";
      positionAsSeconds: number;
    }
  | {
      type: "signal:end";
    }
  | {
      type: "response:paused";
    }
  | {
      type: "response:prepared";
    }
  | {
      type: "response:stopped";
    }
  | {
      type: "response:played";
    }
  | {
      type: "response:sought";
    };

export type MainThreadToPlaybackEvents =
  | {
      type: "response:nextChunk";
      chunks: Float32Array[][];
      chunkIndex: number;
    }
  | {
      type: "request:pause";
    }
  | {
      /**
       * By default, should also pauses the playback.
       */
      type: "request:stop";
    }
  | {
      type: "request:play";
    }
  | {
      type: "request:seek";
      seconds: number;
    }
  | {
      type: "request:prepare";
      /**
       * Duration of the audio in seconds.
       */
      duration: number;
    };

export type PlaybackWorkletPort = {
  postMessage(message: PlaybackToMainThreadEvents, transfer?: any[]): void;
  onmessage: (e: { data: MainThreadToPlaybackEvents }) => any;
};
