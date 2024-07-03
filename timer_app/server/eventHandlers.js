import { sessions } from './sessionState.js';
import { io } from './socketioServer.js';

/**
 * @param {SocketIOServer} socket 
 * @param {string} sessionID 
 * @param {string} target 
 * @param {boolean} justFinished 
 */
function emitTimerUpdate(socket, sessionID, target, justFinished = false) {
    console.log(`INFO: Emitting timer update to ${target}`);
    const session = sessions.get(sessionID);
    if (!session) return;
    let grt = session.timerState.getRemainingTime();
    const emitTo = (sid) => {
        console.log(`INFO: emitTo called with sid ${sid}`);
        const dataToPush = {
            sessionId: sessionID,
            timerState: {
                hours: grt.hours,
                minutes: grt.minutes,
                seconds: grt.seconds,
                running: session.timerState.timeoutRef !== null,
                justFinished: justFinished
            },
            locked: session.timerState.isLocked(),
            lockedForMe: session.timerState.isLockedFor(sid)
        };
        console.log(`INFO: Emitting to ${sid} with data ${JSON.stringify(dataToPush)}`);
        io.to(sid).emit('timer_update', dataToPush);
    };

    if (target === sessionID) {
        session.clients.forEach(emitTo);
    } else {
        emitTo(target);
    }
}

function checkPunish(sessionID, sid) {
    let isPunished = sessions.get(sessionID)?.timerState.punishedSIDs.has(sid);
    if (isPunished) {
        console.error(`WARN: Client ${sid} attempted to perform action on session ${sessionID} while punished`);
    }
    return isPunished;
}

function hasPermission(sessionID, sid) {
    const session = sessions.get(sessionID);
    if (!session || session.clients.size === 0) {
        console.error(`WARN: Client ${sid} attempted to perform action on invalid session ${sessionID}`);
        return false;
    }
    if (session.timerState.isLocked()) {
        if (session.timerState.isLockedFor(sid)) {
            console.error(`WARN: Client ${sid} attempted to perform action on locked session ${sessionID} without permission`);
            return false;
        }
    }
    console.log(`INFO: Client ${sid} has permission to perform action on session ${sessionID}`);
    return true;
}

const eventHandlers = {
    toggle_lock: async (socket, data) => {
        console.log(`INFO: Client ${socket.id} attempted to toggle lock`);
        const sessionID = socket.data.sessionID;
        if (!data) {
            console.error("WARN: Client attempted to toggle lock without data")
            return;
        }
        const { pin, unlockFor } = data;
        const session = sessions.get(sessionID);
        if (!session || checkPunish(sessionID, socket.id)) return;

        if (session.timerState.isLocked()) {
            let bhv = await Bun.password.verify(pin, session.timerState.pin);
            if (bhv) {
                switch (unlockFor) {
                    case 'me':
                        session.timerState.authorizedSIDs.add(socket.id);
                        emitTimerUpdate(io, sessionID, socket.id);
                        break;
                    case 'all':
                        session.timerState.pin = null;
                        session.timerState.authorizedSIDs.clear();
                        emitTimerUpdate(io, sessionID, sessionID);
                        break;
                    default:
                        console.error(`WARN: Client ${socket.id} attempted to unlock session ${sessionID} with invalid unlockFor value ${unlockFor}!`);
                        break;
                }
            } else {
                console.error(`WARN: Client ${socket.id} attempted to unlock session ${sessionID} with incorrect PIN!`);
                session.timerState.punish(socket.id);
            }
        } else if (pin && pin.length >= 6 && /\d{6,8}/.test(pin)) {
            let hash = await Bun.password.hash(pin);
            session.timerState.pin = hash;
            session.timerState.authorizedSIDs.clear();
            session.timerState.authorizedSIDs.add(socket.id);
            emitTimerUpdate(io, sessionID, sessionID);
        } else {
            console.error(`WARN: Client ${socket.id} attempted to lock session ${sessionID} with invalid PIN!`);
        }
    },

    disconnect: (socket, _data) => {
        console.log(`INFO: Client ${socket.id} disconnected`);
        const sessionID = socket.data.sessionID;
        if (!sessionID) {
            return;
        }

        const session = sessions.get(sessionID);
        if (!session) return;

        session.clients.delete(socket.id);
        if (session.clients.size === 0) {
            sessions.delete(sessionID);
        }
    },

    start_timer: (socket, _data) => {
        console.log(`INFO: Client ${socket.id} attempted to start timer`);
        const sessionID = socket.data.sessionID;
        if (!hasPermission(sessionID, socket.id) || checkPunish(sessionID, socket.id)) {
            return;
        }
        const session = sessions.get(sessionID);
        if (!session) return;
        session.timerState.start(io, sessionID);
        session.previousTimerState.copyFrom(session.timerState);
        emitTimerUpdate(io, sessionID, sessionID);
    },

    stop_timer: (socket, _data) => {
        console.log(`INFO: Client ${socket.id} attempted to stop timer`);
        const sessionID = socket.data.sessionID;
        if (!hasPermission(sessionID, socket.id) || checkPunish(sessionID, socket.id)) {
            return;
        }
        const session = sessions.get(sessionID);
        if (!session) return;
        session.timerState.stop();
        emitTimerUpdate(io, sessionID, sessionID);
    },

    reset_timer: (socket, _data) => {
        console.log(`INFO: Client ${socket.id} attempted to reset timer`);
        const sessionID = socket.data.sessionID;
        if (!hasPermission(sessionID, socket.id) || checkPunish(sessionID, socket.id)) {
            return;
        }
        const session = sessions.get(sessionID);
        if (!session) return;
        session.timerState.endTime = null;
        session.timerState.timeoutRef = null;
        session.timerState.minutes = session.previousTimerState.minutes;
        session.timerState.seconds = session.previousTimerState.seconds;
        emitTimerUpdate(io, sessionID, sessionID);
    },

    clear_timer: (socket, _data) => {
        console.log(`INFO: Client ${socket.id} attempted to clear timer`);
        const sessionID = socket.data.sessionID;
        if (!hasPermission(sessionID, socket.id) || checkPunish(sessionID, socket.id)) {
            return;
        }
        const session = sessions.get(sessionID);
        if (!session) return;
        session.timerState.clear();
        emitTimerUpdate(io, sessionID, sessionID);
    },

    set_timer: (socket, data) => {
        console.log(`INFO: Client ${socket.id} attempted to set timer`);
        const sessionID = socket.data.sessionID;
        if (!hasPermission(sessionID, socket.id) || checkPunish(sessionID, socket.id)) {
            return;
        }
        if (!data) {
            return;
        }
        const { unit, value } = data;

        const session = sessions.get(sessionID);
        if (!session) return;
        session.previousTimerState.copyFrom(session.timerState);
        switch (unit) {
            case 'hours':
                if (direction === 'up') {
                    session.timerState.hours++;
                } else {
                    session.timerState.hours--;
                }
                break;
                session.timerState.hours = value;
                break;
            case 'minutes':
                session.timerState.minutes = value;
                break;
            case 'seconds':
                session.timerState.seconds = value;
                break;
        }
        emitTimerUpdate(io, sessionID, sessionID);
    },

    increment_timer: (socket, data) => {
        console.log(`INFO: Client ${socket.id} attempted to increment timer`);
        const sessionID = socket.data.sessionID;
        if (!hasPermission(sessionID, socket.id) || checkPunish(sessionID, socket.id)) {
            return;
        }
        if (!data) {
            console.error(`WARN: Client ${socket.id} attempted to increment timer without data!`);
            return;
        }
        const { unit, direction } = data;
        const validUnits = ['minutes', 'seconds', 'hours'];
        const validDirections = ['up', 'down'];

        const isValidUnit = validUnits.includes(unit);
        const isValidDirection = validDirections.includes(direction);
        if (!isValidUnit || !isValidDirection) {
            console.error(`WARN: Client ${socket.id} attempted to increment timer with invalid unit or direction!`);
            return;
        }

        const session = sessions.get(sessionID);
        if (!session) {
            console.error(`WARN: handleIncrementTimerEvent: Don't know about session ${sessionID}`);
            return;
        }

        console.log(`INFO: Incrementing timer ${unit} ${direction}`);

        switch (unit) {
            case 'seconds':
                if (direction === 'up') {
                    session.timerState.seconds++;
                } else {
                    session.timerState.seconds--;
                }
                if (session.timerState.seconds < 0) {
                    session.timerState.seconds = 59;
                    session.timerState.minutes--;
                } else if (session.timerState.seconds >= 60) {
                    session.timerState.seconds = 0;
                    session.timerState.minutes++;
                }
                break;
            case 'minutes':
                if (direction === 'up') {
                    session.timerState.minutes++;
                } else {
                    session.timerState.minutes--;
                }
                break;
            case 'hours':
                if (direction === 'up') {
                    session.timerState.hours++;
                } else {
                    session.timerState.hours--;
                }
                break;
            default:
                console.log("WARN: Invalid unit");
        }

        console.log(`INFO: ${session.timerState.minutes} minutes, ${session.timerState.seconds} seconds`);
        emitTimerUpdate(io, sessionID, sessionID);
    },

    get_timer: (socket, _data) => {
        console.log(`INFO: Client ${socket.id} attempted to get timer`);
        const sessionID = socket.data.sessionID;
        if (checkPunish(sessionID, socket.id)) {
            return;
        }
        if (sessions.has(sessionID)) {
            emitTimerUpdate(io, sessionID, socket.id);
        } else {
            console.error(`WARN: Client ${socket.id} attempted to get timer for session ${sessionID} that does not exist`);
        }
    }
};

export { emitTimerUpdate, checkPunish, hasPermission, eventHandlers };
