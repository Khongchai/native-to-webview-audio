export class Lock {
  private _locked: boolean;

  public constructor(turnCount: number) {
    if (turnCount === 0) {
      throw new Error("Pal, what do you mean by lock size of 0 ?!");
    }
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
