/**
 * A simple lock implementation.
 *
 * This is used to prevent the worklet from processing audio data while seeking.
 */
export class Lock {
  private _locked: boolean;

  public constructor() {
    this._locked = false;
  }

  public lock() {
    this._locked = true;
  }

  public get isLocked() {
    return this._locked;
  }

  public unlock() {
    this._locked = false;
  }
}
