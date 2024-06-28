import { emitTimerUpdate } from './eventHandlers.js';

/** @type {Map<string, SessionState>} */
const sessions = new Map();

class TimerState {
    constructor() {
        this.clear();
    }

    clear() {
        this.endTime = null;
        this.timeoutRef = null;
        /** @type {Set<string>} */
        this.authorizedSIDs = new Set();
        /** @type {Set<string>} */
        this.punishedSIDs = new Set();
        this.pin = null;
        this.minutes = 0;
        this.seconds = 0;
    }

    copyFrom = (other) => {
        Object.assign(this, other);
        this.authorizedSIDs = new Set(other.authorizedSIDs);
        this.punishedSIDs = new Set(other.punishedSIDs);
    }

    start(io, sessionID) {
        if (!this.timeoutRef) {
            const now = Date.now();
            this.endTime = new Date(now + this.minutes * 60000 + this.seconds * 1000);
            this.timeoutRef = setTimeout(() => this.tick(io, sessionID), this.endTime - now);
        }
    }

    punish(sid) {
        this.punishedSIDs.add(sid);
        setTimeout(() => this.punishedSIDs.delete(sid), 3000);
    }

    getRemainingTime() {
        if (!this.endTime) {
            return { minutes: this.minutes, seconds: this.seconds };
        }
        let remainingTime = Math.max(this.endTime - Date.now(), 0);
        return {
            minutes: Math.floor(remainingTime / 60000),
            seconds: Math.floor((remainingTime % 60000) / 1000)
        };
    }

    isLocked = () => !!(this.pin && this.pin.length >= 6);

    isLockedFor = (sid) => this.isLocked() && !this.authorizedSIDs.has(sid);

    stop() {
        if (this.timeoutRef) {
            clearTimeout(this.timeoutRef);
            this.timeoutRef = null;
        }
        if (this.endTime) {
            let grt = this.getRemainingTime();
            this.minutes = grt.minutes;
            this.seconds = grt.seconds;
        }
        this.endTime = null;
    }

    tick(io, sessionID) {
        if (!this.endTime) return;
        let justFinished = false;
        if (Date.now() >= this.endTime.getTime()) {
            this.minutes = 0;
            this.seconds = 0;
            justFinished = true;
            this.stop();
        } else {
            const remaining = this.endTime.getTime() - Date.now();
            this.minutes = Math.floor(remaining / 60000);
            this.seconds = Math.floor((remaining % 60000) / 1000);
            const nextTick = Math.min(remaining, 1000);
            this.timeoutRef = setTimeout(() => this.tick(io, sessionID), nextTick);
        }
        emitTimerUpdate(io, sessionID, sessionID, justFinished);
    }
}

class SessionState {
    constructor() {
        this.timerState = new TimerState();
        this.previousTimerState = new TimerState();
        /** @type {Set<string>} */
        this.clients = new Set();
    }
}

export { SessionState, TimerState, sessions };