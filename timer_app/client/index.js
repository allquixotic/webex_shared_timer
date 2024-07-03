console.log("Shared Timer index.js client running");
import WebexSdk from '@webex/embedded-app-sdk';
import io from 'socket.io-client';
window.WebexSdk = WebexSdk;
var meetingID = null;
var socket = null;
var webexApp = null;

const pauseIconPath = '/pause.svg';
const playIconPath = '/play.svg';

function impreciseSearch(searchParams) {
    const regexPatterns = ["meetingid", "sessionid"].map(pattern => new RegExp(`^${pattern}$`, 'i'));
    for (const key of searchParams.keys()) {
        for (const regex of regexPatterns) {
            if (regex.test(key)) {
                let candidate = searchParams.get(key);
                if (candidate == "null" || candidate == "undefined") {
                    candidate = null;
                }
                else {
                    return candidate;
                }
            }
        }
    }
    return null;
}

async function getMeetingID() {
    await new Promise(r => setTimeout(r, 1000));
    let urlParams = new URLSearchParams(window.location.search);
    let lup = impreciseSearch(urlParams);
    if (lup && lup != "null") {
        meetingID = lup;
        console.log(`Got meeting ID from URL: ${lup}`);
    }
    else {
        let counter = 1;
        while(true) {
            try {
                webexApp = new WebexSdk.Application();
                await webexApp.onReady();
                let mtg = await webexApp.context.getMeeting();
                meetingID = mtg.id;
                await webexApp.setShareUrl(`${window.location}/index.html?meetingID=${meetingID}`, "", "Shared Timer");
                console.log(`4: webexApp.setShareUrl() successful`);
                break;
            }
            catch (error) {
                await new Promise(r => setTimeout(r, 2000));
                counter++;
                console.error(`Error getting meeting ID from Webex SDK: ${error}, ${typeof error}`);
                if(counter > 5) {
                    break;
                }
            };
        }
    }
    displayWarningIfNoMeetingID();
    console.log(`meetingID at end of getMeetingID(): ${meetingID}`);
    return meetingID;
}

function getSocket() {
    try {
        let srvUrl = `${window.location.protocol}//${window.location.host}`;
        console.log(`Requesting socket for meeting ID ${meetingID} at ${srvUrl}`);
        let ioc = io.connect(srvUrl, { 
            auth: { sessionId: meetingID }
        });
        ioc.on("connect_error", (err) => {
            console.error(`Socket connection error: ${err}`);
            ioc.io.opts.transports = ["polling"];
        });
        return ioc;
    }
    catch (error) {
        console.error("Error creating socket instance: ", error);
        return null;
    }
}

let arrowButtonsEnabled = true;
let isRunning = false;
let currentHours;
let currentMinutes;
let currentSeconds;
let sessionLocks = {};
let lockedForMe = false;
let clientTimerInterval;
const elements = {};

function setupElements() {
    ['playPauseIcon', 'playPauseBtn', 'alarmSound', 'msColon', 'minutes', 'seconds', 'lockControlsBtn', 'lockSymbolIcon', 'submitPin',
    'unlockForMe', 'unlockForAll', 'pinInput', 'pinError', 'pinModal', 'minutesUp', 'minutesDown', 'secondsUp',
    'secondsDown', 'hoursUp', 'hoursDown', 'hours', 'clearBtn', 'playPauseBtn', 'resetBtn', 'close', 'add15mBtn', 'add20mBtn', 'add60mBtn', 'controlsContainer',
    'collapseArrow'].forEach((itm) => {
        elements[itm] = document.getElementById(itm);
    })
}

function setPlayingUI(enabled) {
    if (enabled) {
        elements.playPauseIcon.src = pauseIconPath;
        elements.playPauseBtn.setAttribute('data-running', 'true');
        elements.msColon.classList.add('pulsating-colon');
    } else {
        elements.playPauseIcon.src = playIconPath;
        elements.playPauseBtn.setAttribute('data-running', 'false');
        elements.msColon.classList.remove('pulsating-colon');
    }
}

function displayWarningIfNoMeetingID() {
    if (!meetingID || meetingID === '' || meetingID == 'null') {
        let warningMessage = 'Warning: No meeting ID was supplied. The timer will not function properly.';
        let warningDiv = document.createElement("div");
        warningDiv.style.color = "red";
        warningDiv.style.fontWeight = "bold";
        warningDiv.style.fontSize = "20px";
        warningDiv.style.textAlign = "center";
        warningDiv.style.padding = "10px 0";
        warningDiv.innerHTML = warningMessage;
        document.body.insertBefore(warningDiv, document.body.firstChild);
    }
}

function playAlarmSound() {
    if (elements.alarmSound) {
        console.log("Playing alarm sound.");
        elements.alarmSound.volume = 0.6;
        let playCount = 0;
        let intervalId = setInterval(() => {
            if (playCount >= 2) {
                clearInterval(intervalId);
                return;
            }
            elements.alarmSound.play();
            playCount++;
        }, 1100);
        elements.alarmSound.play();
    }
}

function decrementClientTimer() {
    if (!isRunning) {
        stopClientSideTimer();
        return;
    }

    currentSeconds--;
    if (currentSeconds < 0) {
        currentMinutes--;
        currentSeconds = 59;
    }

    updateTimerDisplay(currentMinutes, currentSeconds);

    if (currentMinutes < 0) {
        currentMinutes = 0;
        currentSeconds = 0;
        clearTimer(false);
        return;
    }

    if (isRunning && currentMinutes === 0 && currentSeconds === 0) {
        clearTimer(false);
    }
}

function startClientTimer() {
    stopClientSideTimer();
    clientTimerInterval = setInterval(decrementClientTimer, 1000);
}

function updateTimerDisplay(hours, minutes, seconds) {
    console.log(`updateTimerDisplay called with hours: ${hours}, minutes: ${minutes}, seconds: ${seconds}, isRunning: ${isRunning}`);
    if (minutes !== null && seconds !== null && hours !== null) {
        let mps = minutes.toString().padStart(2, '0');
        let sps = seconds.toString().padStart(2, '0');
        let hps = hours.toString().padStart(2, '0');
        document.getElementById('hours').value = hps;
        document.getElementById('minutes').value = mps;
        document.getElementById('seconds').value = sps;
    }
    setPlayingUI(isRunning);
    console.log('Updating timer display:', hours, minutes, seconds);
}

function adjustTime(unit, direction) {
    console.log(`adjustTime called with unit: ${unit}, direction: ${direction}`);
    if (arrowButtonsEnabled) {
        socket.emit("increment_timer", { direction: direction, unit: unit, sessionId: meetingID });
    }
}

function setTimerInput(unit, value) {
    console.log(`setTimerInput called with unit: ${unit}, value: ${value}`);
    socket.emit('set_timer', { unit: unit, value: value, sessionId: meetingID });
}

function setTimerInputHours() {
    setTimerInput('hours', elements.hours.value);
}

function setTimerInputMinutes() {
    setTimerInput('minutes', elements.minutes.value);
}

function setTimerInputSeconds() {
    setTimerInput('seconds', elements.seconds.value);
}

function handleInputKeyup(event, unit) {
    if (event.key === 'Enter') {
        const inputValue = parseInt(event.target.value, 10);
        if (!isNaN(inputValue)) {
            const newValue = Math.abs(inputValue);
            event.target.value = newValue.toString().padStart(2, '0');
            socket.emit('set_timer', { unit: unit, value: newValue, sessionId: meetingID });
        }
    }
}

function startTimer() {
    console.log('startTimer called');
    socket.emit('start_timer', { sessionId: meetingID });
    setPlayingUI(true);
    isRunning = true;
}

function stopTimer(do_emit = false) {
    console.log('stopTimer called');
    if (do_emit) {
        socket.emit('stop_timer', { sessionId: meetingID });
    }
    setPlayingUI(false);
    isRunning = false;
}

function toggleTimer() {
    console.log('toggleTimer called');
    if (isRunning) {
        stopTimer(true);
    } else {
        startTimer();
    }
}
function resetTimer() {
    socket.emit('reset_timer', { sessionId: meetingID });
}

function stopClientSideTimer() {
    if (clientTimerInterval) {
        clearInterval(clientTimerInterval);
    }
    clientTimerInterval = null;
}

function clearTimer(do_emit = false) {
    console.log('clearTimer called');
    updateTimerDisplay(0, 0);
    if (do_emit) {
        socket.emit('clear_timer', { sessionId: meetingID });
    }
    isRunning = false;
    setPlayingUI(false);
    stopClientSideTimer();
}

function addTime(minutesToAdd) {
    console.log(`Adding ${minutesToAdd} minutes to the timer`);
    if(isRunning) {
        stopClientSideTimer();
    }

    if(!currentMinutes)
        currentMinutes = 0;

    currentMinutes += minutesToAdd;
    setTimerInput('minutes', currentMinutes);
    elements.minutes.value = currentMinutes;

    if (isRunning) {
        startClientTimer();
    }
}

function updateLockState(locked, lockedForMe) {
    let sharedTimerControls = document.querySelectorAll('#sharedTimerContainer .arrow, #sharedTimerContainer .icon-btn, #sharedTimerContainer .clear-btn, #sharedTimerContainer .reset-btn'); // Note the scoping to '#sharedTimerContainer'

    sharedTimerControls.forEach(button => {
        if (!button.classList.contains('lock-btn')) {
            button.style.opacity = lockedForMe ? 0.3 : 1.0;
            button.disabled = lockedForMe;
        }
    });

    let sharedTimerInputs = document.querySelectorAll('#sharedTimerContainer input');
    sharedTimerInputs.forEach(input => {
        input.disabled = lockedForMe;
    });

    elements.lockSymbolIcon.src = locked ? "/closed_lock.svg" : "/open_lock.svg";
    elements.submitPin.disabled = locked;
    elements.unlockForMe.disabled = !locked;
    elements.unlockForAll.disabled = !locked;
}

document.addEventListener("DOMContentLoaded", async () => {
    setupElements();
    meetingID = await getMeetingID();
    socket = getSocket();
    socket.on('timer_update', function (data) {
        try {
            console.log('Received timer_update event:', data);
            let sessionData = data.timerState;
            if (!sessionData) {
                console.error('No timer data found for the session:', meetingID);
                return;
            }

            let sessionId = data.sessionId;
            if (sessionId != meetingID) {
                console.log("Got timer update about a timer we don't care about");
                return;
            }
            sessionLocks[sessionId] = data.locked;
            lockedForMe = data.lockedForMe;
            updateLockState(data.locked, lockedForMe);

            isRunning = sessionData.running;
            currentHours = sessionData.hours;
            currentMinutes = sessionData.minutes;
            currentSeconds = sessionData.seconds;
            updateTimerDisplay(currentHours, currentMinutes, currentSeconds);
            if (sessionData.justFinished) {
                playAlarmSound();
                stopTimer(false);
            }

            if (isRunning && (currentMinutes > 0 || currentSeconds > 0 || currentHours > 0)) {
                startClientTimer();
            }

            if (!isRunning && !sessionData.justFinished) {
                stopTimer(false);
            }
        } catch (error) {
            console.error('Error processing timer_update event:', error);
        }
    });

    elements.submitPin.addEventListener('click', function () {
        let pin = elements.pinInput.value.trim();
        if (pin.length === 6) {
            socket.emit('toggle_lock', { sessionId: meetingID, pin: pin });
            elements.pinError.style.display = "none";
        } else {
            elements.pinError.innerText = "Please enter a 6-digit PIN.";
            elements.pinError.style.display = "block";
        }
        elements.pinModal.style.display = "none";
    });
    
    elements.unlockForMe.addEventListener('click', function () {
        let pin = elements.pinInput.value;
        if (pin.length === 6) {
            socket.emit('toggle_lock', { sessionId: meetingID, pin: pin, unlockFor: 'me' });
            elements.pinError.style.display = "none";
        } else {
            elements.pinError.innerText = "Please enter a 6-digit PIN.";
            elements.pinError.style.display = "block";
        }
        elements.pinModal.style.display = "none";
    });
    
    elements.unlockForAll.addEventListener('click', function () {
        let pin = elements.pinInput.value;
        if (pin.length === 6) {
            socket.emit('toggle_lock', { sessionId: meetingID, pin: pin, unlockFor: 'all' });
            elements.pinError.style.display = "none";
        } else {
            elements.pinError.innerText = "Please enter a 6-digit PIN.";
            elements.pinError.style.display = "block";
        }
        elements.pinModal.style.display = "none";
    });
    
    elements.hoursUp.addEventListener('click', () => adjustTime('hours', 'up'));
    elements.hoursDown.addEventListener('click', () => adjustTime('hours', 'down'));
    elements.hours.addEventListener('input', () => setTimerInputHours());
    elements.hours.addEventListener('keyup', (event) => handleInputKeyup(event, 'hours'));
    elements.minutesUp.addEventListener('click', () => adjustTime('minutes', 'up'));
    elements.minutesDown.addEventListener('click', () => adjustTime('minutes', 'down'));
    elements.minutes.addEventListener('input', () => setTimerInputMinutes());
    elements.minutes.addEventListener('keyup', (event) => handleInputKeyup(event, 'minutes'));
    elements.secondsUp.addEventListener('click', () => adjustTime('seconds', 'up'));
    elements.secondsDown.addEventListener('click', () => adjustTime('seconds', 'down'));
    elements.seconds.addEventListener('input', () => setTimerInputSeconds());
    elements.seconds.addEventListener('keyup', (event) => handleInputKeyup(event, 'seconds'));
    elements.clearBtn.addEventListener('click', () => clearTimer(true));
    elements.resetBtn.addEventListener('click', () => resetTimer());
    elements.playPauseBtn.addEventListener('click', () => toggleTimer());
    elements.add15mBtn.addEventListener('click', () => addTime(15));
     elements.add20mBtn.addEventListener('click', () => addTime(20));
     elements.add60mBtn.addEventListener('click', () => addTime(60));
    elements.pinInput.addEventListener('input', function (e) {
        this.value = this.value.replace(/\D/g, '');
    });

    elements.lockControlsBtn.addEventListener('click', function () {
        elements.pinModal.style.display = "inline-block";
    });
    
    elements.close.addEventListener('click', function () {
        elements.pinModal.style.display = "none";
        elements.pinError.style.display = "none"; 
    });
    socket.emit('get_timer', { sessionId: meetingID });

    elements.collapseArrow.addEventListener('click', () => {
        controlsContainer.classList.toggle('collapsed');
    });
});

