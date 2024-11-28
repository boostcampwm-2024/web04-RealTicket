type Listener = (text: string) => void;

export default class ToastEvent {
  private static instance: ToastEvent;
  private list: Map<string, Set<Listener>> = new Map();

  private constructor() {}

  public static getInstance() {
    if (!ToastEvent.instance) {
      ToastEvent.instance = new ToastEvent();
    }
    return ToastEvent.instance;
  }

  on(event: string, callback: Listener) {
    if (!this.list.has(event)) {
      this.list.set(event, new Set());
    }
    this.list.get(event)?.add(callback);
  }

  emit(event: string, text: string) {
    if (this.list.has(event)) {
      const callbacks = this.list.get(event);
      callbacks?.forEach((listener) => listener(text));
    }
  }

  off(event: string, targetListener: Listener) {
    if (this.list.has(event)) {
      this.list.get(event)?.delete(targetListener);
    }
  }
}
