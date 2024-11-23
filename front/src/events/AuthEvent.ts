type Listener = (data?: unknown) => void;

export default class AuthEvent {
  private static instance: AuthEvent;
  private list: Map<string, Set<Listener>> = new Map();

  private constructor() {}

  public static getInstance() {
    if (!AuthEvent.instance) {
      AuthEvent.instance = new AuthEvent();
    }
    return AuthEvent.instance;
  }

  on(event: string, callback: Listener) {
    if (!this.list.has(event)) {
      this.list.set(event, new Set());
    }
    this.list.get(event)?.add(callback);
  }

  emit(event: string, data?: unknown) {
    if (this.list.has(event)) {
      const callbacks = this.list.get(event);
      callbacks?.forEach((listener) => listener(data));
    }
  }

  off(event: string, targetListener: Listener) {
    if (this.list.has(event)) {
      this.list.get(event)?.delete(targetListener);
    }
  }
}

export const auth = {
  logout: () => AuthEvent.getInstance().emit('logout'),
};
