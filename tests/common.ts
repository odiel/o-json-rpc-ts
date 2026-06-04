import { assertEquals, assertGreaterOrEqual, assertLessOrEqual, fail } from '@std/assert';
import { AbstractLogger, LogLevel, type ResourceName, Server } from '../src/index.ts';

export const sleepTimeoutIds: Record<number, number> = {};

export class TestLogger extends AbstractLogger {
    public logEntries: {
        level: LogLevel;
        message: string;
        metadata?: Record<string, unknown>;
    }[] = [];

    constructor(level?: LogLevel) {
        super(level ?? LogLevel.INFO);
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

    public reset() {
        this.logEntries = [];
    }

    public assertLog(level: LogLevel, message: string) {
        for (const entry of this.logEntries) {
            if (entry.level === level && entry.message.indexOf(message) != -1) {
                return;
            }
        }

        const recentLogMessage = this.logEntries.reverse();
        fail(
            `Expecting log message: [${Object.values(LogLevel)[level]}] ${message}\n Most recent log message: ${recentLogMessage[0].level}: ${recentLogMessage[0].message} `,
        );
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

        this.logEntries.push({ level, message, metadata });
    }
}

export async function httpRequest(options: {
    method: string;
    url?: string;
    body?: string;
    origin?: string;
}) {
    let response;

    if (options.body) {
        response = await fetch(
            `http://${host}:${port}${(options.url ?? '/')}`,
            {
                method: options.method,
                headers: {
                    'Content-Type': 'application/json',
                    'origin': options.origin ?? 'http://localhost',
                },
                body: options.body ?? null,
            },
        );
    } else {
        response = await fetch(
            'http://' + host + ':' + port + (options.url ?? '/'),
            {
                method: options.method,
                headers: {
                    'Content-Type': 'application/json',
                    'origin': options.origin ?? 'http://localhost',
                },
            },
        );
    }

    return {
        status: response.status,
        response: await response.json(),
        headers: response.headers,
    };
}

type ServerResponse = {
    protocol: string;
    api: string;
    procedures?: Record<string, unknown>;
    resources?: Record<string, unknown>;
    details?: {
        request_id?: string;
        execution_time?: number;
        procedures_execution?: Record<string, {
            procedure: string;
            order: number;
            execution_time: number;
            timed_out: boolean;
        }>;
    };
    error?: {
        code: string;
        message: string;
    };
};

export function websocketRequest(payload: string): Promise<ServerResponse> {
    const websocket = new WebSocket('ws://' + host + ':' + port);

    websocket.onopen = () => {
        websocket.send(payload);
    };

    websocket.onclose = async () => {
    };

    return new Promise((resolve, reject) => {
        websocket.onmessage = (websocketMessage) => {
            resolve(JSON.parse(websocketMessage.data));
            websocket.close(1000);
        };

        websocket.onerror = (error) => {
            reject(error);
        };
    });
}

export function subscribeToResource(
    api: string,
    resources: { resource_name: ResourceName }[],
    callback: (message: Record<string, unknown>) => void,
) {
    const websocket = new WebSocket('ws://' + host + ':' + port);

    websocket.onopen = () => {
        websocket.send(JSON.stringify({
            protocol: 'v1',
            api,
            subscriptions: resources,
        }));
    };

    websocket.onclose = () => {};
    websocket.onerror = () => {};

    websocket.onmessage = (websocketMessage) => {
        callback(JSON.parse(websocketMessage.data));
    };

    return websocket;
}

export function assertProcedureDetails(
    details: {
        procedure: string;
        order: number;
        execution_time: number;
        timed_out: boolean;
    },
    procedure: string,
    order: number,
    executionTime: [string, number],
    timedOut: boolean,
) {
    assertEquals(details.procedure, procedure);
    assertEquals(details.order, order);
    if (executionTime[0] == '>') {
        assertGreaterOrEqual(details.execution_time, executionTime[1]);
    } else {
        assertLessOrEqual(details.execution_time, executionTime[1]);
    }
    assertEquals(details.timed_out, timedOut);
}

export function sleep(ms: number) {
    return new Promise((resolve, _reject) => {
        const sleepTimeoutId = setTimeout(() => {
            resolve(null);
        }, ms);

        sleepTimeoutIds[sleepTimeoutId] = sleepTimeoutId;
    });
}

export const host = '127.0.0.1';
export const port = 7000;

export const serverLogger = new TestLogger(LogLevel.DEBUG);

export function createServer() {
    return new Server({
        host,
        port,
        logger: serverLogger,
    });
}

export async function stopServer(server: Server) {
    for (const id of Object.values(sleepTimeoutIds)) {
        clearTimeout(id);
    }

    if (server) {
        await server.stop();
    }
}

export const uuidRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;
