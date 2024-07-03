import { Server as SocketIOServer } from 'socket.io';
import { eventHandlers } from './eventHandlers.js';
import { SessionState, sessions } from './sessionState.js';
import { httpServer } from './httpServer.js';

const io = new SocketIOServer(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "HEAD", "OPTIONS"],
        allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept"]
    },
    cleanupEmptyChildNamespaces: true,
    maxHttpBufferSize: 1e9
});

io.on('connection', (socket) => {
    const sessionID = socket.handshake?.auth?.sessionId;
    console.log(`INFO: Client ${socket.id} connected with session ${sessionID}`);

    Object.keys(eventHandlers).forEach(event => {
        socket.on(event, (data) => eventHandlers[event](socket, data));
    });

    socket.conn.on('upgrade', (transport) => {
        console.log(`INFO: Client ${socket.id} upgraded to ${transport.name}`);
    });

    if (sessionID && sessionID.length < 512) {
        let session = sessions.get(sessionID);
        if (!session) {
            session = new SessionState();
            sessions.set(sessionID, session);
        }
        session.clients.add(socket.id);
        session.hours = 0;
        socket.join(sessionID);
        socket.join(socket.id);
        socket.data.sessionID = sessionID;

        console.log(`INFO: END of Client ${socket.id} connection process with session ${sessionID}`);
    } else {
        console.error(`WARN: Client ${socket.id} connected without session.`);
    }
});

io.on('connection_error', (err) => {
    console.error(`ERROR: connection_error: ${err}`);
});

io.on('connect_failed', (err) => {
    console.error(`ERROR: connect_failed: ${err}`);
});

export { io };
