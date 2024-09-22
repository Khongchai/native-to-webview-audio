import type { PlaybackWorkletPort } from "./protocol.type";

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
