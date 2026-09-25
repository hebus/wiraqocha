/** Minimal pub-sub state container — the sole owner of the `GameState`. */
export class Store<T> {
  private listeners = new Set<(state: T) => void>();

  constructor(private _state: T) {}

  get state(): T {
    return this._state;
  }

  set(next: T) {
    this._state = next;
    for (const listener of this.listeners) listener(next);
  }

  subscribe(listener: (state: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
