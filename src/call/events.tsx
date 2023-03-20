
export class CustomEventClass {
    private listeners: { [eventType: string]: ((type?: string, payload?: any) => void)[] } = {};

    public on(eventType: string, listener: (payload: any) => void) {
        if (!this.listeners[eventType]) {
            this.listeners[eventType] = [];
        }
        this.listeners[eventType].push(listener);
    }

    public once(eventType: string, listener: (payload: any) => void) {
        this.listeners[eventType] = [];
        this.listeners[eventType].push(listener);
    }

    public off(eventType: string, listener: (payload: any) => void) {
        const eventListeners = this.listeners[eventType];
        if (eventListeners) {
            const index = eventListeners.indexOf(listener);
            if (index >= 0) {
                eventListeners.splice(index, 1);
            }
        }
    }

    emit(type: string, payload?: any ) {
        const eventListeners = this.listeners[type];
        if (eventListeners) {
            eventListeners.forEach((listener) => {
                listener(payload);
            });
        }
    }

    emitMessage(type: string, payload?: any ){
        const eventListeners = this.listeners['message'];
        if (eventListeners) {
            eventListeners.forEach((listener) => {
                listener(type, payload);
            });
        }
    }
}
