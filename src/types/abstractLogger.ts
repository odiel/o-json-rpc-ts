export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARNING = 2,
    ERROR = 3,
}

/**
 * Abstract Logger class to instantiate and pass to the Server instance.
 */
export abstract class AbstractLogger {
    constructor(protected logLevel: LogLevel) {
    }

    /**
     * Logs an entry with DEBUG level
     *
     * @param message Message to log
     * @param metadata Log metadata
     */
    abstract debug(message: string, metadata?: Record<string, unknown>): void;

    /**
     * Logs an entry with INFO level
     *
     * @param message Message to log
     * @param metadata Log metadata
     */
    abstract info(message: string, metadata?: Record<string, unknown>): void;

    /**
     * Logs an entry with WARNING level
     *
     * @param message Message to log
     * @param metadata Log metadata
     */
    abstract warning(message: string, metadata?: Record<string, unknown>): void;

    /**
     * Logs an entry with ERROR level
     *
     * @param message Message to log
     * @param metadata Log metadata
     * @param error Optional error object to add to the log
     */
    abstract error(
        message: string,
        metadata?: Record<string, unknown>,
        error?: unknown,
    ): void;
}

/**
 * Simple logger class that outputs messages to the console.
 */
export class ConsoleLogger extends AbstractLogger {
    constructor(logLevel: LogLevel) {
        super(logLevel);
    }

    public debug(message: string, metadata?: Record<string, unknown>): void {
        if (this.logLevel <= LogLevel.DEBUG) {
            this.log(LogLevel.DEBUG, message, metadata);
        }
    }

    public info(message: string, metadata?: Record<string, unknown>): void {
        if (this.logLevel <= LogLevel.INFO) {
            this.log(LogLevel.INFO, message, metadata);
        }
    }

    public warning(message: string, metadata?: Record<string, unknown>): void {
        if (this.logLevel <= LogLevel.WARNING) {
            this.log(LogLevel.WARNING, message, metadata);
        }
    }

    public error(message: string, metadata?: Record<string, unknown>): void {
        if (this.logLevel <= LogLevel.ERROR) {
            this.log(LogLevel.ERROR, message, metadata);
        }
    }

    private log(
        level: LogLevel,
        message: string,
        metadata?: Record<string, unknown>,
    ) {
        const time = new Date();
        let logLevel = '\x1b[31m[ERROR]\x1b[0m';
        switch (level) {
            case LogLevel.DEBUG:
                logLevel = '\x1b[37m[DEBUG]\x1b[0m';
                break;
            case LogLevel.INFO:
                logLevel = '\x1b[34m[INFO]\x1b[0m';
                break;
            case LogLevel.WARNING:
                logLevel = '\x1b[33m[WARNING]\x1b[0m';
                break;
        }
        console.log(logLevel + ' [' + time.toISOString() + '] ' + message);
        if (metadata) {
            console.log(JSON.stringify(metadata));
        }
    }
}
