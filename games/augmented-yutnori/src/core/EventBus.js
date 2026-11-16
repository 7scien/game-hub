export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, listener, { priority = 0, id = Symbol(eventName) } = {}) {
    const listeners = this.listeners.get(eventName) || [];
    listeners.push({ id, listener, priority });
    listeners.sort((a, b) => b.priority - a.priority);
    this.listeners.set(eventName, listeners);
    return () => this.off(eventName, id);
  }

  off(eventName, id) {
    const listeners = this.listeners.get(eventName) || [];
    this.listeners.set(eventName, listeners.filter((entry) => entry.id !== id));
  }

  emit(eventName, context = {}) {
    const event = { cancelled: false, eventName, ...context };
    for (const { listener } of this.listeners.get(eventName) || []) {
      listener(event);
      if (event.cancelled) break;
    }
    return event;
  }
}
