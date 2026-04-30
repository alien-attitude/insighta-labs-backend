//import 'dotenv/config';
import './config/env.js';
import app from './app.js';
import connectToDatabase from './database/mongodb.js';
import {PORT, SERVER_URL} from './config/env.js';

const startServer = async () => {
    try {
        await connectToDatabase();

        app.listen(PORT, () => {
            console.log(`Server is running at ${SERVER_URL}`);
            console.log(`Health check: ${SERVER_URL}/health`);
            console.log(`Profiles API: ${SERVER_URL}/api/profiles`);
        })
    } catch(err){
        console.error("Database connection failed, Server not started", err);
        process.exit(1);
    }
};

await startServer()