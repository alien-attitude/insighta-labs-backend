import morgan from "morgan";

// Custom token: authenticated user ID
morgan.token("user", (req) => req.user?.userId || "anonymous");

// Format: METHOD /path 200 45ms [user-id]
const requestLogger = morgan(":method :url :status :response-time ms [:user]", {
    stream: {
        write: (msg) => console.log(msg.trim()),
    },
});

export { requestLogger };
