import { io } from './socketioServer.js';
import { httpServer } from './httpServer.js';

httpServer.listen(9001, () => {
    console.log(`Server is running on port 9001 (JS)`);
});

