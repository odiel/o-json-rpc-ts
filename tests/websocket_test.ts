import { assertEquals, assertGreaterOrEqual, assertMatch } from '@std/assert';
import type { JRPCError, ProcedureRequestContext, ProcedureResult, RequestContext } from '../src/index.ts';
import { Server } from '../src/index.ts';
import {
    APIs,
    ApplicationInternalError,
    badHelloV1,
    delayedHelloV1,
    failingV1,
    Greeting,
    HelloInputV1,
    HelloInputV2,
    helloV1,
    helloV2,
    pingV1,
    Pong,
    ProcedureError,
    procedureNames,
    reportV2,
} from './procedures.ts';

import { assertProcedureDetails, createServer, host, port, serverLogger, stopServer, uuidRegex, websocketRequest } from './common.ts';

let server: Server;

Deno.test.beforeEach(() => {
    server = createServer();
});

Deno.test.afterEach(async () => {
    await stopServer(server);
});

Deno.test('Upgrading the request to a non supported protocol returns an error', async () => {
    server.start();

    const response = await fetch(
        `http://${host}:${port}`,
        {
            method: 'post',
            headers: {
                'Content-Type': 'application/json',
                'origin': 'http://localhost',
                'upgrade': 'h2c',
            },
            body: null,
        },
    );

    const json = await response.json();

    assertEquals(json, {
        protocol: 'v1',
        api: 'unknown',
        error: {
            code: 'SERVER:UPGRADE_REQUEST_NOT_SUPPORTED',
            message: 'Upgrade request not supported.',
        },
    });
});

Deno.test('Requesting without a payload returns error code SERVER:INVALID_INPUT_JSON_SCHEMA.', async () => {
    server.start();

    const response = await websocketRequest('');

    assertEquals(response, {
        protocol: 'v1',
        api: 'unknown',
        error: {
            code: 'SERVER:INCOMPATIBLE_REQUEST_CONTENT',
            message: 'Request content is incompatible with the protocol schema.',
        },
    });
});

Deno.test('Requesting with an invalid JSON returns error code SERVER:INVALID_INPUT_JSON_SCHEMA.', async () => {
    server.start();

    const response = await websocketRequest('Some content');

    assertEquals(response, {
        protocol: 'v1',
        api: 'unknown',
        error: {
            code: 'SERVER:INCOMPATIBLE_REQUEST_CONTENT',
            message: 'Request content is incompatible with the protocol schema.',
        },
    });
});

Deno.test(
    'Requesting with a content that exceeds the maxBodySizeBytes configuration returns error code SERVER:REQUEST_CONTENT_TOO_BIG.',
    async () => {
        server = new Server({
            host,
            port,
            logger: serverLogger,
            request: {
                maxBodySizeBytes: 20,
            },
        });
        server.start();

        const response = await websocketRequest(JSON.stringify({
            protocol: 'v1',
            api: 'v1',
            procedures: [],
        }));

        assertEquals(response, {
            protocol: 'v1',
            api: 'unknown',
            error: {
                code: 'SERVER:REQUEST_CONTENT_TOO_BIG',
                message: 'Request content too big.',
            },
        });
    },
);

Deno.test('Requesting with an incompatible schema returns error code SERVER:INVALID_INPUT_JSON_SCHEMA.', async () => {
    server.start();

    const response = await websocketRequest(JSON.stringify({
        version: 'v1',
        api_version: 'v1',
    }));

    assertEquals(response, {
        protocol: 'v1',
        api: 'unknown',
        error: {
            code: 'SERVER:INCOMPATIBLE_REQUEST_CONTENT',
            message: 'Request content is incompatible with the protocol schema.',
        },
    });
});

Deno.test('Calling a procedure for a non defined API returns error code SERVER:PROCEDURE_NOT_FOUND.', async () => {
    server.start();

    const response = await websocketRequest(JSON.stringify({
        protocol: 'v1',
        api: 'v3',
        procedures: [
            {
                id: 'hello',
                name: 'hello',
                input: 'World',
            },
        ],
    }));

    assertEquals(response, {
        protocol: 'v1',
        api: 'v3',
        procedures: {
            hello: {
                error: {
                    code: 'PROCEDURE:NOT_FOUND',
                    message: 'Procedure not found.',
                },
            },
        },
    });
});

Deno.test('Asserting invalid input and output procedure resources.', async (t) => {
    server
        .registerResource(APIs.v2, HelloInputV2.name, HelloInputV2.schema)
        .registerResource(APIs.v2, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v2, procedureNames.badHello, badHelloV1, { input: HelloInputV2.name, output: Greeting.name })
        .start();

    await t.step(
        'calling a procedure with a bad input returns error code PROCEDURE:INCOMPATIBLE_INPUT for that procedure.',
        async () => {
            const response = await websocketRequest(JSON.stringify({
                protocol: 'v1',
                api: 'v2',
                procedures: [
                    {
                        id: 'badHello',
                        name: 'badHello',
                        input: 'World',
                    },
                ],
            }));

            assertEquals(response, {
                protocol: 'v1',
                api: 'v2',
                procedures: {
                    badHello: {
                        error: {
                            code: 'PROCEDURE:INCOMPATIBLE_INPUT',
                            message: 'Incompatible input content.',
                        },
                    },
                },
            });
        },
    );

    await t.step(
        'calling a procedure that generates a bad output resource returns error code PROCEDURE:INCOMPATIBLE_RESULT for that procedure.',
        async () => {
            const response = await websocketRequest(JSON.stringify({
                protocol: 'v1',
                api: 'v2',
                procedures: [
                    {
                        id: 'badHello',
                        name: 'badHello',
                        input: {
                            firstName: 'Wonderful',
                            lastName: 'World',
                        },
                    },
                ],
            }));

            assertEquals(response, {
                protocol: 'v1',
                api: 'v2',
                procedures: {
                    badHello: {
                        error: {
                            code: 'PROCEDURE:INCOMPATIBLE_OUTPUT',
                            message: 'Incompatible output content.',
                        },
                    },
                },
            });
        },
    );
});

Deno.test('Asserting procedures calls.', async (t) => {
    server
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerResource(APIs.v1, Pong.name, Pong.schema)
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v1, procedureNames.delayedHello, delayedHelloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1, { output: Pong.name })
        .registerSubscription(APIs.v1, Greeting.name)
        .registerResource(APIs.v2, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v2, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v2, procedureNames.hello, helloV2, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v2, procedureNames.report, reportV2)
        .start();

    await t.step(
        'requesting v1 of [hello] procedure returns a [Greeting] resource.',
        async () => {
            const response = await websocketRequest(JSON.stringify({
                protocol: 'v1',
                api: 'v1',
                procedures: [
                    {
                        id: 'hello',
                        name: 'hello',
                        input: 'Client',
                    },
                ],
            }));

            assertEquals(response, {
                protocol: 'v1',
                api: 'v1',
                procedures: {
                    hello: {
                        result: {
                            greeting: 'Hello Client!',
                        },
                    },
                },
            });
        },
    );

    await t.step(
        'requesting v2 of [hello] procedure returns a [Greeting] resource.',
        async () => {
            const response = await websocketRequest(JSON.stringify({
                protocol: 'v1',
                api: 'v2',
                procedures: [
                    {
                        id: 'hello',
                        name: 'hello',
                        input: 'Client',
                    },
                ],
            }));

            assertEquals(response, {
                protocol: 'v1',
                api: 'v2',
                procedures: {
                    hello: {
                        result: {
                            greeting: 'Hi there, Client!',
                        },
                    },
                },
            });
        },
    );

    await t.step(
        'calling multiple procedures in one request process each procedure and return their results.',
        async () => {
            const response = await websocketRequest(JSON.stringify({
                protocol: 'v1',
                api: 'v1',
                procedures: [
                    {
                        id: 'hello',
                        name: 'hello',
                        input: 'Client',
                    },
                    {
                        id: 'delayedHello',
                        name: 'delayedHello',
                        input: 'Patience',
                    },
                    {
                        id: 'ping',
                        name: 'ping',
                    },
                ],
            }));

            assertEquals(response, {
                protocol: 'v1',
                api: 'v1',
                procedures: {
                    hello: {
                        result: {
                            greeting: 'Hello Client!',
                        },
                    },
                    delayedHello: {
                        result: {
                            greeting: 'Hello Patience!',
                        },
                    },
                    ping: {
                        result: 'pong!',
                    },
                },
            });
        },
    );

    await t.step(
        'calling a procedure that does not have an output resource definition returns null.',
        async () => {
            const response = await websocketRequest(JSON.stringify({
                protocol: 'v1',
                api: 'v2',
                procedures: [
                    {
                        id: 'hello',
                        name: 'hello',
                        input: 'Client',
                    },
                    {
                        id: 'report',
                        name: 'report',
                    },
                ],
            }));

            assertEquals(response, {
                protocol: 'v1',
                api: 'v2',
                procedures: {
                    hello: {
                        result: {
                            greeting: 'Hi there, Client!',
                        },
                    },
                    report: {
                        result: null,
                    },
                },
            });
        },
    );
});

Deno.test(`Asserting return options: request_id, request_execution_time`, async (t) => {
    server
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerResource(APIs.v1, Pong.name, Pong.schema)
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v1, procedureNames.delayedHello, delayedHelloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1, { output: Pong.name })
        .registerResource(APIs.v2, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v2, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v2, procedureNames.hello, helloV2, { input: HelloInputV1.name, output: Greeting.name })
        .start();

    await t.step(
        `with execution strategy [sequential] returns the request id and the total execution time.`,
        async () => {
            const response = await websocketRequest(JSON.stringify({
                protocol: 'v1',
                api: 'v1',
                procedures: [
                    {
                        id: 'hello',
                        name: 'hello',
                        input: 'Client',
                    },
                    {
                        id: 'delayedHello',
                        name: 'delayedHello',
                        input: 'Patience',
                    },
                    {
                        id: 'ping',
                        name: 'ping',
                    },
                ],
                options: {
                    return: ['request_id', 'request_execution_time'],
                    execution: { strategy: 'sequential' },
                },
            }));

            assertEquals(response.protocol, 'v1');
            assertEquals(response.api, 'v1');
            assertEquals(response.procedures, {
                hello: {
                    result: {
                        greeting: 'Hello Client!',
                    },
                },
                delayedHello: {
                    result: {
                        greeting: 'Hello Patience!',
                    },
                },
                ping: {
                    result: 'pong!',
                },
            });
            assertMatch(response.details!.request_id!, uuidRegex);
            assertGreaterOrEqual(
                response.details!.execution_time,
                100,
            );
        },
    );

    await t.step(
        `with execution strategy [parallel] returns the request id and the total execution time.`,
        async () => {
            const response = await websocketRequest(JSON.stringify({
                protocol: 'v1',
                api: 'v1',
                procedures: [
                    {
                        id: 'hello',
                        name: 'hello',
                        input: 'Client',
                    },
                    {
                        id: 'delayedHello',
                        name: 'delayedHello',
                        input: 'Patience',
                    },
                    {
                        id: 'ping',
                        name: 'ping',
                    },
                ],
                options: {
                    return: ['request_id', 'request_execution_time'],
                    execution: { strategy: 'parallel' },
                },
            }));

            assertEquals(response.protocol, 'v1');
            assertEquals(response.api, 'v1');
            assertEquals(response.procedures, {
                hello: {
                    result: {
                        greeting: 'Hello Client!',
                    },
                },
                delayedHello: {
                    result: {
                        greeting: 'Hello Patience!',
                    },
                },
                ping: {
                    result: 'pong!',
                },
            });

            assertMatch(response.details!.request_id!, uuidRegex);
            assertGreaterOrEqual(
                response.details!.execution_time,
                100,
            );
        },
    );
});

Deno.test(`Asserting return options: procedures_execution_details`, async (t) => {
    server
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerResource(APIs.v1, Pong.name, Pong.schema)
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v1, procedureNames.delayedHello, delayedHelloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1, { output: Pong.name })
        .registerResource(APIs.v2, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v2, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v2, procedureNames.ping, helloV2, { input: HelloInputV1.name, output: Greeting.name })
        .start();

    await t.step(
        `with execution strategy [sequential] returns the procedure details.`,
        async () => {
            const response = await websocketRequest(JSON.stringify({
                protocol: 'v1',
                api: 'v1',
                procedures: [
                    {
                        id: 'hello',
                        name: 'hello',
                        input: 'Client',
                    },
                    {
                        id: 'delayedHello',
                        name: 'delayedHello',
                        input: 'Patience',
                    },
                    {
                        id: 'ping',
                        name: 'ping',
                    },
                ],
                options: {
                    return: ['procedures_execution_details'],
                    execution: {
                        strategy: 'sequential',
                    },
                },
            }));

            assertEquals(response.protocol, 'v1');
            assertEquals(response.api, 'v1');
            assertEquals(response.procedures, {
                hello: {
                    result: {
                        greeting: 'Hello Client!',
                    },
                },
                delayedHello: {
                    result: {
                        greeting: 'Hello Patience!',
                    },
                },
                ping: {
                    result: 'pong!',
                },
            });

            // [hello] procedure details
            assertProcedureDetails(
                response.details!.procedures_execution!.hello,
                'hello',
                1,
                ['<', 1],
                false,
            );

            // [delayedHello] procedure details
            assertProcedureDetails(
                response.details!.procedures_execution!.delayedHello,
                'delayedHello',
                2,
                ['>', 100],
                false,
            );

            // [ping] procedure details
            assertProcedureDetails(
                response.details!.procedures_execution!.ping,
                'ping',
                3,
                ['<', 1],
                false,
            );
        },
    );

    await t.step(
        `with execution strategy [parallel] returns the procedure details.`,
        async () => {
            const response = await websocketRequest(JSON.stringify({
                protocol: 'v1',
                api: 'v1',
                procedures: [
                    {
                        id: 'hello',
                        name: 'hello',
                        input: 'Client',
                    },
                    {
                        id: 'delayedHello',
                        name: 'delayedHello',
                        input: 'Patience',
                    },
                    {
                        id: 'ping',
                        name: 'ping',
                    },
                ],
                options: {
                    return: ['procedures_execution_details'],
                    execution: {
                        strategy: 'parallel',
                    },
                },
            }));

            assertEquals(response.protocol, 'v1');
            assertEquals(response.api, 'v1');
            assertEquals(response.procedures, {
                hello: {
                    result: {
                        greeting: 'Hello Client!',
                    },
                },
                delayedHello: {
                    result: {
                        greeting: 'Hello Patience!',
                    },
                },
                ping: {
                    result: 'pong!',
                },
            });

            // [hello] procedure details
            assertProcedureDetails(
                response.details!.procedures_execution!.hello,
                'hello',
                1,
                ['<', 1],
                false,
            );

            // [ping] procedure details
            assertProcedureDetails(
                response.details!.procedures_execution!.ping,
                'ping',
                2,
                ['<', 1],
                false,
            );

            // [delayedHello] procedure details
            assertProcedureDetails(
                response.details!.procedures_execution!.delayedHello,
                'delayedHello',
                3,
                ['>', 100],
                false,
            );
        },
    );
});

Deno.test(`Asserting procedure execution with a set 5ms timeout.`, async (t) => {
    server
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerResource(APIs.v1, Pong.name, Pong.schema)
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v1, procedureNames.delayedHello, delayedHelloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1, { output: Pong.name })
        .registerResource(APIs.v2, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v2, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v2, procedureNames.hello, helloV2, { input: HelloInputV1.name, output: Greeting.name })
        .start();

    await t.step(
        `with execution strategy [sequential] times out the [delayedHello] procedure and returns all procedure details.`,
        async () => {
            const response = await websocketRequest(JSON.stringify({
                protocol: 'v1',
                api: 'v1',
                procedures: [
                    {
                        id: 'hello',
                        name: 'hello',
                        input: 'Client',
                    },
                    {
                        id: 'delayedHello',
                        name: 'delayedHello',
                        input: 'Patience',
                    },
                ],
                options: {
                    return: ['procedures_execution_details'],
                    execution: {
                        strategy: 'sequential',
                        procedure_timeout: 5,
                    },
                },
            }));

            assertEquals(response.protocol, 'v1');
            assertEquals(response.api, 'v1');
            assertEquals(response.procedures, {
                hello: {
                    result: {
                        greeting: 'Hello Client!',
                    },
                },
                delayedHello: {
                    error: {
                        code: 'PROCEDURE:TIMEOUT',
                        message: 'Procedure timed out.',
                    },
                },
            });

            // [hello] procedure details
            assertProcedureDetails(
                response.details!.procedures_execution!.hello,
                'hello',
                1,
                ['<', 1],
                false,
            );

            // [delayedHello] procedure details
            assertProcedureDetails(
                response.details!.procedures_execution!.delayedHello,
                'delayedHello',
                2,
                ['>', 5],
                true,
            );
        },
    );

    await t.step(
        `with execution strategy [parallel] times out the [delayedHello] procedure and returns all procedure details.`,
        async () => {
            const response = await websocketRequest(JSON.stringify({
                protocol: 'v1',
                api: 'v1',
                procedures: [
                    {
                        id: 'hello',
                        name: 'hello',
                        input: 'Client',
                    },
                    {
                        id: 'delayedHello',
                        name: 'delayedHello',
                        input: 'Patience',
                    },
                    {
                        id: 'ping',
                        name: 'ping',
                    },
                ],
                options: {
                    return: ['procedures_execution_details'],
                    execution: {
                        strategy: 'parallel',
                        procedure_timeout: 5,
                    },
                },
            }));

            assertEquals(response.protocol, 'v1');
            assertEquals(response.api, 'v1');
            assertEquals(response.procedures, {
                hello: {
                    result: {
                        greeting: 'Hello Client!',
                    },
                },
                delayedHello: {
                    error: {
                        code: 'PROCEDURE:TIMEOUT',
                        message: 'Procedure timed out.',
                    },
                },
                ping: {
                    result: 'pong!',
                },
            });

            // [hello] procedure details
            assertProcedureDetails(
                response.details!.procedures_execution!.hello,
                'hello',
                1,
                ['<', 1],
                false,
            );

            // [ping] procedure details
            assertProcedureDetails(
                response.details!.procedures_execution!.ping,
                'ping',
                2,
                ['<', 1],
                false,
            );

            // [delayedHello] procedure details
            assertProcedureDetails(
                response.details!.procedures_execution!.delayedHello,
                'delayedHello',
                3,
                ['>', 5],
                true,
            );
        },
    );
});

/**
 * Hooks and error handling tests
 */
Deno.test('Asserting hooks execution.', async () => {
    const hooksExecuted = {
        beforeAll: 0,
        beforeEach: 0,
        afterEach: 0,
        afterAll: 0,
    };

    server
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerResource(APIs.v1, Pong.name, Pong.schema)
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v1, procedureNames.delayedHello, delayedHelloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1, { output: Pong.name })
        .registerResource(APIs.v2, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v2, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v2, procedureNames.ping, helloV2, { input: HelloInputV1.name, output: Greeting.name })
        .beforeAll((_context: RequestContext) => {
            hooksExecuted.beforeAll += 1;
        }).beforeEach((_context: RequestContext) => {
            hooksExecuted.beforeEach += 1;
        }).afterEach((_result: ProcedureResult, _context: RequestContext) => {
            hooksExecuted.afterEach += 1;
        }).afterAll((_context: RequestContext) => {
            hooksExecuted.afterAll += 1;
        }).start();

    const response = await websocketRequest(JSON.stringify({
        protocol: 'v1',
        api: 'v1',
        procedures: [
            {
                id: 'hello',
                name: 'hello',
                input: 'Client',
            },
            {
                id: 'ping',
                name: 'ping',
            },
        ],
        options: {
            return: ['procedures_execution_details'],
            execution: {
                strategy: 'sequential',
            },
        },
    }));

    assertEquals(response.protocol, 'v1');
    assertEquals(response.api, 'v1');
    assertEquals(response.procedures, {
        hello: {
            result: {
                greeting: 'Hello Client!',
            },
        },
        ping: {
            result: 'pong!',
        },
    });

    // [hello] procedure details
    assertProcedureDetails(
        response.details!.procedures_execution!.hello,
        'hello',
        1,
        ['<', 1],
        false,
    );

    // [ping] procedure details
    assertProcedureDetails(
        response.details!.procedures_execution!.ping,
        'ping',
        2,
        ['<', 1],
        false,
    );

    assertEquals(hooksExecuted, {
        beforeAll: 1,
        beforeEach: 2,
        afterEach: 2,
        afterAll: 1,
    });
});

Deno.test('Asserting unhandled errors in the [beforeAll] hook.', async () => {
    server
        .registerResource(APIs.v1, Pong.name, Pong.schema)
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1, { output: Pong.name })
        .beforeAll((_context: RequestContext) => {
            throw new Error('custom error');
        }).start();

    const response = await websocketRequest(JSON.stringify({
        protocol: 'v1',
        api: 'v1',
        procedures: [
            {
                id: 'ping',
                name: 'ping',
            },
        ],
    }));

    assertEquals(response.protocol, 'v1');
    assertEquals(response.api, 'v1');
    assertEquals(response.procedures, undefined);
    assertEquals(response.error, {
        code: 'SERVER:UNHANDLED_ERROR',
        message: 'Unhandled error.',
    });
});

Deno.test('Asserting unhandled errors in the [afterAll] hook.', async () => {
    server
        .registerResource(APIs.v1, Pong.name, Pong.schema)
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1, { output: Pong.name })
        .afterAll((_context: RequestContext) => {
            throw new Error('custom error');
        }).start();

    const response = await websocketRequest(JSON.stringify({
        protocol: 'v1',
        api: 'v1',
        procedures: [
            {
                id: 'ping',
                name: 'ping',
            },
        ],
    }));

    assertEquals(response.protocol, 'v1');
    assertEquals(response.api, 'v1');
    assertEquals(response.procedures, undefined);
    assertEquals(response.error, {
        code: 'SERVER:UNHANDLED_ERROR',
        message: 'Unhandled error.',
    });
});

Deno.test('Asserting unhandled errors in the [beforeEach] hook.', async () => {
    server
        .registerResource(APIs.v1, Pong.name, Pong.schema)
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1, { output: Pong.name })
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .beforeEach(
            (_c: RequestContext, procedure: ProcedureRequestContext) => {
                if (procedure.name == 'hello') {
                    throw new Error('custom error');
                }
            },
        ).start();

    const response = await websocketRequest(JSON.stringify({
        protocol: 'v1',
        api: 'v1',
        procedures: [
            {
                id: 'hello',
                name: 'hello',
                input: 'Client',
            },
            {
                id: 'ping',
                name: 'ping',
            },
        ],
    }));

    assertEquals(response.protocol, 'v1');
    assertEquals(response.api, 'v1');
    assertEquals(response.procedures, {
        hello: {
            error: {
                code: 'SERVER:UNHANDLED_ERROR',
                message: 'Unhandled error.',
            },
        },
        ping: {
            result: 'pong!',
        },
    });
});

Deno.test('Asserting unhandled errors in the [afterEach] hook.', async () => {
    server
        .registerResource(APIs.v1, Pong.name, Pong.schema)
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1, { output: Pong.name })
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .afterEach(
            (_result: ProcedureResult, _c: RequestContext, procedure: ProcedureRequestContext) => {
                if (procedure.name == 'ping') {
                    throw new Error('custom error');
                }
            },
        ).start();

    const response = await websocketRequest(JSON.stringify({
        protocol: 'v1',
        api: 'v1',
        procedures: [
            {
                id: 'hello',
                name: 'hello',
                input: 'Client',
            },
            {
                id: 'ping',
                name: 'ping',
            },
        ],
    }));

    assertEquals(response.protocol, 'v1');
    assertEquals(response.api, 'v1');
    assertEquals(response.procedures, {
        hello: {
            result: {
                greeting: 'Hello Client!',
            },
        },
        ping: {
            error: {
                code: 'SERVER:UNHANDLED_ERROR',
                message: 'Unhandled error.',
            },
        },
    });
});

Deno.test('Asserting unhandled errors during a procedure execution.', async () => {
    server
        .registerResource(APIs.v1, Pong.name, Pong.schema)
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1, { output: Pong.name })
        .registerProcedure(APIs.v1, procedureNames.fail, failingV1)
        .start();

    const response = await websocketRequest(JSON.stringify({
        protocol: 'v1',
        api: 'v1',
        procedures: [
            {
                id: 'fail',
                name: 'fail',
            },
            {
                id: 'ping',
                name: 'ping',
            },
        ],
    }));

    assertEquals(response.protocol, 'v1');
    assertEquals(response.api, 'v1');
    assertEquals(response.procedures, {
        fail: {
            error: {
                code: 'SERVER:UNHANDLED_ERROR',
                message: 'Unhandled error.',
            },
        },
        ping: {
            result: 'pong!',
        },
    });
});

Deno.test('Asserting errors in the [beforeAll] hook are handled.', async () => {
    server
        .registerResource(APIs.v1, Pong.name, Pong.schema)
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1, { output: Pong.name })
        .beforeAll((_context: RequestContext) => {
            throw new Error('custom error');
        }).onError(
            (_error: unknown, _context: RequestContext): JRPCError => {
                return new ApplicationInternalError();
            },
        ).start();

    const response = await websocketRequest(JSON.stringify({
        protocol: 'v1',
        api: 'v1',
        procedures: [
            {
                id: 'ping',
                name: 'ping',
            },
        ],
    }));

    assertEquals(response.protocol, 'v1');
    assertEquals(response.api, 'v1');
    assertEquals(response.procedures, undefined);
    assertEquals(response.error, {
        code: 'APPLICATION:INTERNAL_ERROR',
        message: 'Internal error.',
    });
});

Deno.test('Asserting errors in the [afterAll] hook are handled.', async () => {
    server
        .registerResource(APIs.v1, Pong.name, Pong.schema)
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1, { output: Pong.name })
        .afterAll((_context: RequestContext) => {
            throw new Error('custom error');
        })
        .onError(
            (_error: unknown, _context: RequestContext): JRPCError => {
                return new ApplicationInternalError();
            },
        ).start();

    const response = await websocketRequest(JSON.stringify({
        protocol: 'v1',
        api: 'v1',
        procedures: [
            {
                id: 'ping',
                name: 'ping',
            },
        ],
    }));

    assertEquals(response.protocol, 'v1');
    assertEquals(response.api, 'v1');
    assertEquals(response.procedures, undefined);
    assertEquals(response.error, {
        code: 'APPLICATION:INTERNAL_ERROR',
        message: 'Internal error.',
    });
});

Deno.test('Asserting errors in the [beforeEach] hook are handled.', async () => {
    server
        .registerResource(APIs.v1, Pong.name, Pong.schema)
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1, { output: Pong.name })
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .beforeEach(
            (_c: RequestContext, procedure: ProcedureRequestContext) => {
                if (procedure.name == 'hello') {
                    throw new Error('custom error');
                }
            },
        ).onError(
            (
                _error: unknown,
                _context: RequestContext,
                _procedureContext?: ProcedureRequestContext,
            ): JRPCError => {
                return new ProcedureError();
            },
        ).start();

    const response = await websocketRequest(JSON.stringify({
        protocol: 'v1',
        api: 'v1',
        procedures: [
            {
                id: 'hello',
                name: 'hello',
                input: 'Client',
            },
            {
                id: 'ping',
                name: 'ping',
            },
        ],
    }));

    assertEquals(response.protocol, 'v1');
    assertEquals(response.api, 'v1');
    assertEquals(response.procedures, {
        hello: {
            error: {
                code: 'APPLICATION:FAILED_EXECUTION',
                message: 'Procedure failure.',
            },
        },
        ping: {
            result: 'pong!',
        },
    });
});

Deno.test('Asserting errors in the [afterEach] hook are handled.', async () => {
    server
        .registerResource(APIs.v1, Pong.name, Pong.schema)
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1, { output: Pong.name })
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .afterEach(
            (_result: ProcedureResult, _c: RequestContext, procedure: ProcedureRequestContext) => {
                if (procedure.name == 'ping') {
                    throw new Error('custom error');
                }
            },
        ).onError(
            (
                _error: unknown,
                _context: RequestContext,
                _procedureContext?: ProcedureRequestContext,
            ): JRPCError => {
                return new ProcedureError();
            },
        ).start();

    const response = await websocketRequest(JSON.stringify({
        protocol: 'v1',
        api: 'v1',
        procedures: [
            {
                id: 'hello',
                name: 'hello',
                input: 'Client',
            },
            {
                id: 'ping',
                name: 'ping',
            },
        ],
    }));

    assertEquals(response.protocol, 'v1');
    assertEquals(response.api, 'v1');
    assertEquals(response.procedures, {
        hello: {
            result: {
                greeting: 'Hello Client!',
            },
        },
        ping: {
            error: {
                code: 'APPLICATION:FAILED_EXECUTION',
                message: 'Procedure failure.',
            },
        },
    });
});

Deno.test('Asserting errors during a procedure execution are handled.', async () => {
    server
        .registerResource(APIs.v1, Pong.name, Pong.schema)
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1, { output: Pong.name })
        .registerProcedure(APIs.v1, procedureNames.fail, failingV1)
        .onError(
            (
                _error: unknown,
                _context: RequestContext,
                _procedureContext?: ProcedureRequestContext,
            ): JRPCError => {
                return new ProcedureError();
            },
        )
        .start();

    const response = await websocketRequest(JSON.stringify({
        protocol: 'v1',
        api: 'v1',
        procedures: [
            {
                id: 'fail',
                name: 'fail',
            },
            {
                id: 'ping',
                name: 'ping',
            },
        ],
    }));

    assertEquals(response.protocol, 'v1');
    assertEquals(response.api, 'v1');
    assertEquals(response.procedures, {
        fail: {
            error: {
                code: 'APPLICATION:FAILED_EXECUTION',
                message: 'Procedure failure.',
            },
        },
        ping: {
            result: 'pong!',
        },
    });
});
