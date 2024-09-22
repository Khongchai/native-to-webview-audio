export class Lock {
  private _lock: boolean;
  private _turnCount: number;
  private _turn: number;

  public constructor(turnCount: number) {
    if (turnCount === 0) {
      throw new Error("Pal, what do you mean by lock size of 0 ?!");
    }
    this._lock = false;
    this._turnCount = turnCount;
    this._turn = 0;
  }

  public lock() {
    this._lock = true;
    this._turn = 0;
  }

  public get isLocked() {
    return this._lock;
  }

  public attemptUnlock() {
    if (!this._lock) {
      return;
    }
    this._turn++;
    console.debug(
      `Attempt count: ${this._turn}, total turnkeys: ${this._turnCount}`
    );
    if (this._turn >= this._turnCount) {
      this._lock = false;
      this._turn = 0;
      console.debug("Unlocked!");
    }
  }
}
