import { assertEquals, assertGreaterOrEqual, assertMatch, assertThrows } from '@std/assert';
import type { JRPCError, ProcedureRequestContext, RequestContext } from '../src/index.ts';
import { LogLevel, Server, ServerInstanceError } from '../src/index.ts';
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

import { assertProcedureDetails, createServer, host, httpRequest, port, serverLogger, stopServer, uuidRegex } from './common.ts';

let server: Server;

Deno.test.beforeEach(() => {
    server = createServer();
});

Deno.test.afterEach(async () => {
    await stopServer(server);
});

Deno.test('Registering the same resource twice throws an error.', () => {
    const msg = `[v1]: resource [Greeting] is already registered.`;

    assertThrows(
        () => {
            server
                .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
                .registerResource(APIs.v1, Greeting.name, Greeting.schema)
                .registerResource(APIs.v1, Greeting.name, Greeting.schema);
        },
        ServerInstanceError,
        msg,
    );

    serverLogger.assertLog(LogLevel.ERROR, msg);
});

Deno.test('Registering a procedure handler without first registering the input resource in the API throws an error.', () => {
    const msg = `[v1]: input resource [HelloInput] for procedure [hello] has not been registered yet.`;

    assertThrows(
        () => {
            server
                .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name });
        },
        ServerInstanceError,
        msg,
    );

    serverLogger.assertLog(LogLevel.ERROR, msg);
});

Deno.test('Registering a procedure handler without first registering the input resource throws an error.', () => {
    const msg = `[v1]: input resource [HelloInput] for procedure [hello] has not been registered yet.`;

    assertThrows(
        () => {
            server
                .registerResource(APIs.v1, Greeting.name, Greeting.schema)
                .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name });
        },
        ServerInstanceError,
        msg,
    );

    serverLogger.assertLog(LogLevel.ERROR, msg);
});

Deno.test('Registering a procedure handler without first registering the output resource in the API throws an error.', () => {
    const msg = `[v1]: output resource [Greeting] for procedure [hello] has not been registered yet.`;

    assertThrows(
        () => {
            server
                .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { output: Greeting.name });
        },
        ServerInstanceError,
        msg,
    );

    serverLogger.assertLog(LogLevel.ERROR, msg);
});

Deno.test('Registering a procedure handler without first registering the output resource throws an error.', () => {
    const msg = `[v1]: output resource [Greeting] for procedure [hello] has not been registered yet.`;

    assertThrows(
        () => {
            server
                .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
                .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { output: Greeting.name });
        },
        ServerInstanceError,
        msg,
    );

    serverLogger.assertLog(LogLevel.ERROR, msg);
});

Deno.test('Registering a procedure handler twice throws an error.', () => {
    const msg = `[v1]: procedure handler [hello] is already registered.`;

    assertThrows(
        () => {
            server
                .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
                .registerResource(APIs.v1, Greeting.name, Greeting.schema)
                .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
                .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name });
        },
        ServerInstanceError,
        msg,
    );

    serverLogger.assertLog(LogLevel.ERROR, msg);
});

Deno.test('Registering a subscription handler without first registering the output resource throws an error.', () => {
    const msg = `[v1]: subscription for resource [Greeting] not possible, resource has not been registered yet.`;

    assertThrows(
        () => {
            server
                .registerSubscription(APIs.v1, Greeting.name);
        },
        ServerInstanceError,
        msg,
    );

    serverLogger.assertLog(LogLevel.ERROR, msg);
});

Deno.test('Registering a subscription handler twice throws an error.', () => {
    const msg = `[v1]: subscription handler for [Greeting] already registered.`;

    assertThrows(
        () => {
            server
                .registerResource(APIs.v1, Greeting.name, Greeting.schema)
                .registerSubscription(APIs.v1, Greeting.name)
                .registerSubscription(APIs.v1, Greeting.name);
        },
        ServerInstanceError,
        msg,
    );

    serverLogger.assertLog(LogLevel.ERROR, msg);
});

Deno.test('Requesting OPTIONS without specifying an origin returns a 200 with the expected headers.', async () => {
    server.start();

    const result = await httpRequest({
        method: 'OPTIONS',
    });

    assertEquals(result.status, 200);
    assertEquals(result.response, '');
    assertEquals(
        result.headers.get('content-type'),
        'application/json',
    );
    assertEquals(
        result.headers.get('access-control-allow-headers'),
        'Access-Control-Allow-Origin, Access-Control-Allow-Methods, Access-Control-Allow-Headers, Content-Type',
    );
    assertEquals(
        result.headers.get('access-control-allow-method'),
        'GET, OPTIONS, POST',
    );
    assertEquals(
        result.headers.get('access-control-allow-origin'),
        'http://localhost',
    );
});

Deno.test('Requesting OPTIONS when specifying an origin returns a 200 with the expected headers.', async () => {
    server = new Server({
        host,
        port,
        logger: serverLogger,
        cors: {
            accessControlAllowOrigin: 'http://10.10.10.10',
        },
    });
    server.start();

    const result = await httpRequest({
        method: 'OPTIONS',
        origin: 'http://10.10.10.10',
    });

    assertEquals(result.status, 200);
    assertEquals(result.response, '');
    assertEquals(
        result.headers.get('content-type'),
        'application/json',
    );
    assertEquals(
        result.headers.get('access-control-allow-headers'),
        'Access-Control-Allow-Origin, Access-Control-Allow-Methods, Access-Control-Allow-Headers, Content-Type',
    );
    assertEquals(
        result.headers.get('access-control-allow-method'),
        'GET, OPTIONS, POST',
    );
    assertEquals(
        result.headers.get('access-control-allow-origin'),
        'http://10.10.10.10',
    );
});

Deno.test('Requesting with a not allowed origin returns earlier without providing results.', async () => {
    server = new Server({
        host,
        port,
        logger: serverLogger,
        cors: {
            accessControlAllowOrigin: '10.10.10.10',
        },
    });
    server
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .start();

    const result = await httpRequest({
        method: 'POST',
        body: JSON.stringify({
            protocol: 'v1',
            api: 'v1',
            procedures: [
                {
                    id: 'hello',
                    name: 'hello',
                    input: 'World',
                },
            ],
        }),
    });

    assertEquals(result.status, 403);
    assertEquals(result.response, {
        protocol: 'v1',
        api: 'unknown',
    });
    assertEquals(
        result.headers.get('content-type'),
        'application/json',
    );
    assertEquals(
        result.headers.get('access-control-allow-headers'),
        null,
    );
    assertEquals(
        result.headers.get('access-control-allow-method'),
        null,
    );
    assertEquals(
        result.headers.get('access-control-allow-origin'),
        null,
    );
});

Deno.test('Requesting with an allowed origin returns the result of the procedure execution and the allowed origin header.', async () => {
    server = new Server({
        host,
        port,
        logger: serverLogger,
        cors: {
            accessControlAllowOrigin: '10.10.10.10',
        },
    });
    server
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .start();

    const result = await httpRequest({
        method: 'POST',
        body: JSON.stringify({
            protocol: 'v1',
            api: 'v1',
            procedures: [
                {
                    id: 'hello',
                    name: 'hello',
                    input: 'World',
                },
            ],
        }),
        origin: '10.10.10.10',
    });

    assertEquals(result.status, 200);
    assertEquals(result.response, {
        protocol: 'v1',
        api: 'v1',
        procedures: { hello: { result: { greeting: 'Hello World!' } } },
    });
    assertEquals(
        result.headers.get('content-type'),
        'application/json',
    );
    assertEquals(
        result.headers.get('access-control-allow-origin'),
        '10.10.10.10',
    );
});

Deno.test(
    'Requesting the API definition for a blank server returns an empty [apis] section.',
    async () => {
        server.start();

        const result = await httpRequest({
            method: 'GET',
            url: '/definition',
        });

        assertEquals(result.status, 200);
        assertEquals(result.response, { protocol: 'v1', apis: {} });
    },
);

Deno.test(
    'Requesting the API definition when the server is configured with exposeDefinition: false returns error code SERVER:REQUEST_METHOD_NOT_SUPPORTED.',
    async () => {
        server = new Server({
            host,
            port,
            logger: serverLogger,
            exposeDefinition: false,
        });
        server.start();

        const result = await httpRequest({
            method: 'GET',
            url: '/definition',
        });

        assertEquals(result.status, 405);
        assertEquals(result.response, {
            protocol: 'v1',
            api: 'unknown',
            error: {
                code: 'SERVER:REQUEST_METHOD_NOT_SUPPORTED',
                message: 'Request method not supported.',
            },
        });
    },
);

Deno.test('Requesting the API definition for a server with registered procedures and subscriptions returns a defined [apis] section.', async () => {
    server
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerSubscription(APIs.v1, Greeting.name)
        .registerResource(APIs.v2, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v2, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v2, procedureNames.hello, helloV2, { input: HelloInputV1.name, output: Greeting.name })
        .start();

    const result = await httpRequest({
        method: 'GET',
        url: '/definition',
    });

    assertEquals(result.status, 200);
    assertEquals(result.response, {
        protocol: 'v1',
        apis: {
            v1: {
                procedures: {
                    hello: {
                        input: `#/resources/${HelloInputV1.name}`,
                        output: `#/resources/${Greeting.name}`,
                    },
                },
                subscriptions: [`#/resources/${Greeting.name}`],
                resources: {
                    [HelloInputV1.name]: HelloInputV1.schema.toJSONSchema(),
                    [Greeting.name]: Greeting.schema.toJSONSchema(),
                },
            },
            v2: {
                procedures: {
                    hello: {
                        input: `#/resources/${HelloInputV1.name}`,
                        output: `#/resources/${Greeting.name}`,
                    },
                },
                subscriptions: [],
                resources: {
                    [HelloInputV1.name]: HelloInputV1.schema.toJSONSchema(),
                    [Greeting.name]: Greeting.schema.toJSONSchema(),
                },
            },
        },
    });
});

Deno.test('Requesting with an unsupported HTTP method returns error code SERVER:REQUEST_METHOD_NOT_SUPPORTED.', async () => {
    server.start();

    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
        const result = await httpRequest({
            method,
        });

        assertEquals(result.status, 405);
        assertEquals(result.response, {
            protocol: 'v1',
            api: 'unknown',
            error: {
                code: 'SERVER:REQUEST_METHOD_NOT_SUPPORTED',
                message: 'Request method not supported.',
            },
        });
    }
});

Deno.test('Requesting without a body returns error code SERVER:INVALID_INPUT_JSON_SCHEMA.', async () => {
    server.start();

    const result = await httpRequest({
        method: 'POST',
    });

    assertEquals(result.status, 400);
    assertEquals(result.response, {
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

    const result = await httpRequest({
        method: 'POST',
        body: 'Some body content',
    });

    assertEquals(result.status, 400);
    assertEquals(result.response, {
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

        const result = await httpRequest({
            method: 'POST',
            body: JSON.stringify({
                protocol: 'v1',
                api: 'v1',
                procedures: [],
            }),
        });

        assertEquals(result.status, 400);
        assertEquals(result.response, {
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

    const result = await httpRequest(
        {
            method: 'POST',
            body: JSON.stringify({
                version: 'v1',
                api_version: 'v1',
            }),
        },
    );

    assertEquals(result.status, 400);
    assertEquals(result.response, {
        protocol: 'v1',
        api: 'unknown',
        error: {
            code: 'SERVER:INCOMPATIBLE_REQUEST_CONTENT',
            message: 'Request content is incompatible with the protocol schema.',
        },
    });
});

Deno.test('Calling a procedure for a not defined API returns error code SERVER:PROCEDURE_NOT_FOUND.', async () => {
    server.start();

    const result = await httpRequest({
        method: 'POST',
        body: JSON.stringify({
            protocol: 'v1',
            api: 'v3',
            procedures: [
                {
                    id: 'hello',
                    name: 'hello',
                    input: 'World',
                },
            ],
        }),
    });

    assertEquals(result.status, 200);
    assertEquals(result.response, {
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

Deno.test('Calling a not registered procedure for a defined API returns error code SERVER:PROCEDURE_NOT_FOUND.', async () => {
    server
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .start();

    const result = await httpRequest({
        method: 'POST',
        body: JSON.stringify({
            protocol: 'v1',
            api: 'v1',
            procedures: [
                {
                    id: 'sayHello',
                    name: 'sayHello',
                    input: 'World',
                },
            ],
        }),
    });

    assertEquals(result.status, 200);
    assertEquals(result.response, {
        protocol: 'v1',
        api: 'v1',
        procedures: {
            sayHello: {
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
            const result = await httpRequest({
                method: 'POST',
                body: JSON.stringify({
                    protocol: 'v1',
                    api: 'v2',
                    procedures: [
                        {
                            id: 'badHello',
                            name: 'badHello',
                            input: 'World',
                        },
                    ],
                }),
            });

            assertEquals(result.status, 200);
            assertEquals(result.response, {
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
            const result = await httpRequest({
                method: 'POST',
                body: JSON.stringify({
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
                }),
            });

            assertEquals(result.status, 200);
            assertEquals(result.response, {
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

Deno.test(
    'Asserting ping request.',
    async () => {
        server.start();

        const result = await httpRequest({
            method: 'POST',
            body: JSON.stringify({
                protocol: 'v1',
                api: 'v1',
            }),
        });

        assertEquals(result.status, 200);
        assertEquals(result.response, {
            protocol: 'v1',
            api: 'v1',
        });
    },
);

Deno.test('Asserting procedures calls.', async (t) => {
    server
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerResource(APIs.v1, Pong.name, Pong.schema)
        .registerProcedure(APIs.v1, procedureNames.delayedHello, delayedHelloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1, { output: Pong.name })
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerSubscription(APIs.v1, Greeting.name)
        .registerResource(APIs.v2, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v2, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v2, procedureNames.hello, helloV2, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v2, procedureNames.report, reportV2)
        .start();

    await t.step(
        'requesting v1 of [hello] procedure returns a [Greeting] resource.',
        async () => {
            const result = await httpRequest({
                method: 'POST',
                body: JSON.stringify({
                    protocol: 'v1',
                    api: 'v1',
                    procedures: [
                        {
                            id: 'hello',
                            name: 'hello',
                            input: 'Client',
                        },
                    ],
                }),
            });

            assertEquals(result.status, 200);
            assertEquals(result.response, {
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
            const result = await httpRequest({
                method: 'POST',
                body: JSON.stringify({
                    protocol: 'v1',
                    api: 'v2',
                    procedures: [
                        {
                            id: 'hello',
                            name: 'hello',
                            input: 'Client',
                        },
                    ],
                }),
            });

            assertEquals(result.status, 200);
            assertEquals(result.response, {
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
            const result = await httpRequest({
                method: 'POST',
                body: JSON.stringify({
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
                }),
            });

            assertEquals(result.status, 200);
            assertEquals(result.response, {
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
            const result = await httpRequest({
                method: 'POST',
                body: JSON.stringify({
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
                }),
            });

            assertEquals(result.status, 200);
            assertEquals(result.response, {
                protocol: 'v1',
                api: 'v2',
                procedures: {
                    hello: {
                        result: {
                            greeting: 'Hi there, Client!',
                        },
                    },
                    report: { result: null },
                },
            });
        },
    );
});

Deno.test(`Asserting sending a request id in the options returns that request id`, async () => {
    server
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .start();

    const result = await httpRequest({
        method: 'POST',
        body: JSON.stringify({
            protocol: 'v1',
            api: 'v1',
            procedures: [
                {
                    id: 'hello',
                    name: 'hello',
                    input: 'Client',
                },
            ],
            options: {
                request_id: '123',
                return: ['request_id'],
            },
        }),
    });

    assertEquals(result.status, 200);
    assertEquals(result.response.protocol, 'v1');
    assertEquals(result.response.api, 'v1');
    assertEquals(result.response.procedures, {
        hello: {
            result: {
                greeting: 'Hello Client!',
            },
        },
    });
    assertEquals(result.response.details.request_id, '123');
});

Deno.test(`Asserting return options: request_id, request_execution_time`, async (t) => {
    server
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v1, procedureNames.delayedHello, delayedHelloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1)
        .registerSubscription(APIs.v1, Greeting.name)
        .registerResource(APIs.v2, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v2, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v2, procedureNames.hello, helloV2, { input: HelloInputV1.name, output: Greeting.name })
        .start();

    await t.step(
        `with execution strategy [sequential] returns the request id and the total execution time.`,
        async () => {
            const result = await httpRequest({
                method: 'POST',
                body: JSON.stringify({
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
                }),
            });

            assertEquals(result.status, 200);
            assertEquals(result.response.protocol, 'v1');
            assertEquals(result.response.api, 'v1');
            assertEquals(result.response.procedures, {
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
            assertMatch(result.response.details.request_id, uuidRegex);
            assertGreaterOrEqual(
                result.response.details.execution_time,
                100,
            );
        },
    );

    await t.step(
        `with execution strategy [parallel] returns the request id and the total execution time.`,
        async () => {
            const result = await httpRequest({
                method: 'POST',
                body: JSON.stringify({
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
                }),
            });

            assertEquals(result.status, 200);
            assertEquals(result.response.protocol, 'v1');
            assertEquals(result.response.api, 'v1');
            assertEquals(result.response.procedures, {
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
            assertMatch(result.response.details.request_id, uuidRegex);
            assertGreaterOrEqual(
                result.response.details.execution_time,
                100,
            );
        },
    );
});

Deno.test(`Asserting return options: procedures_execution_details`, async (t) => {
    server
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v1, procedureNames.delayedHello, delayedHelloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1)
        .registerResource(APIs.v2, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v2, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v2, procedureNames.hello, helloV2, { input: HelloInputV1.name, output: Greeting.name })
        .start();

    await t.step(
        `with execution strategy [sequential] returns the procedure details.`,
        async () => {
            const result = await httpRequest({
                method: 'POST',
                body: JSON.stringify({
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
                        return: ['request_execution_time', 'procedures_execution_details'],
                        execution: {
                            strategy: 'sequential',
                        },
                    },
                }),
            });

            assertEquals(result.status, 200);
            assertEquals(result.response.protocol, 'v1');
            assertEquals(result.response.api, 'v1');
            assertEquals(result.response.procedures, {
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
            assertGreaterOrEqual(result.response.details.execution_time, 100);

            // [hello] procedure details
            assertProcedureDetails(
                result.response.details.procedures_execution.hello,
                'hello',
                1,
                ['<', 1],
                false,
            );

            // [delayedHello] procedure details
            assertProcedureDetails(
                result.response.details.procedures_execution.delayedHello,
                'delayedHello',
                2,
                ['>', 100],
                false,
            );

            // [ping] procedure details
            assertProcedureDetails(
                result.response.details.procedures_execution.ping,
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
            const result = await httpRequest({
                method: 'POST',
                body: JSON.stringify({
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
                }),
            });

            assertEquals(result.status, 200);
            assertEquals(result.response.protocol, 'v1');
            assertEquals(result.response.api, 'v1');
            assertEquals(result.response.procedures, {
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
                result.response.details.procedures_execution.hello,
                'hello',
                1,
                ['<', 1],
                false,
            );

            // [ping] procedure details
            assertProcedureDetails(
                result.response.details.procedures_execution.ping,
                'ping',
                2,
                ['<', 1],
                false,
            );

            // [delayedHello] procedure details
            assertProcedureDetails(
                result.response.details.procedures_execution.delayedHello,
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
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v1, procedureNames.delayedHello, delayedHelloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1)
        .registerResource(APIs.v2, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v2, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v2, procedureNames.hello, helloV2, { input: HelloInputV1.name, output: Greeting.name })
        .start();

    await t.step(
        `with execution strategy [sequential] times out the [delayedHello] procedure and returns all procedure details.`,
        async () => {
            const result = await httpRequest({
                method: 'POST',
                body: JSON.stringify({
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
                }),
            });

            assertEquals(result.status, 200);
            assertEquals(result.response.protocol, 'v1');
            assertEquals(result.response.api, 'v1');
            assertEquals(result.response.procedures, {
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
                result.response.details.procedures_execution.hello,
                'hello',
                1,
                ['<', 1],
                false,
            );

            // [delayedHello] procedure details
            assertProcedureDetails(
                result.response.details.procedures_execution.delayedHello,
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
            const result = await httpRequest({
                method: 'POST',
                body: JSON.stringify({
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
                }),
            });

            assertEquals(result.status, 200);
            assertEquals(result.response.protocol, 'v1');
            assertEquals(result.response.api, 'v1');
            assertEquals(result.response.procedures, {
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
                result.response.details.procedures_execution.hello,
                'hello',
                1,
                ['<', 1],
                false,
            );

            // [ping] procedure details
            assertProcedureDetails(
                result.response.details.procedures_execution.ping,
                'ping',
                2,
                ['<', 1],
                false,
            );

            // [delayedHello] procedure details
            assertProcedureDetails(
                result.response.details.procedures_execution.delayedHello,
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
    server
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerResource(APIs.v1, Pong.name, Pong.schema)
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v1, procedureNames.delayedHello, delayedHelloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1, { output: Pong.name })
        .registerResource(APIs.v2, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v2, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v2, procedureNames.hello, helloV2, { input: HelloInputV1.name, output: Greeting.name });

    const hooksExecuted = {
        beforeAll: 0,
        beforeEach: 0,
        afterEach: 0,
        afterAll: 0,
    };

    server.beforeAll((_context: RequestContext) => {
        hooksExecuted.beforeAll += 1;
    });

    server.beforeEach((_context: RequestContext) => {
        hooksExecuted.beforeEach += 1;
    });

    server.afterEach((_context: RequestContext) => {
        hooksExecuted.afterEach += 1;
    });

    server.afterAll((_context: RequestContext) => {
        hooksExecuted.afterAll += 1;
    });

    server.start();

    const result = await httpRequest({
        method: 'POST',
        body: JSON.stringify({
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
        }),
    });

    assertEquals(result.status, 200);
    assertEquals(result.response.protocol, 'v1');
    assertEquals(result.response.api, 'v1');
    assertEquals(result.response.procedures, {
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
        result.response.details.procedures_execution.hello,
        'hello',
        1,
        ['<', 1],
        false,
    );

    // [ping] procedure details
    assertProcedureDetails(
        result.response.details.procedures_execution.ping,
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
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1)
        .beforeAll((_context: RequestContext) => {
            throw new Error('custom error');
        })
        .start();

    const result = await httpRequest({
        method: 'POST',
        body: JSON.stringify({
            protocol: 'v1',
            api: 'v1',
            procedures: [
                {
                    id: 'ping',
                    name: 'ping',
                },
            ],
        }),
    });

    assertEquals(result.status, 200);
    assertEquals(result.response.protocol, 'v1');
    assertEquals(result.response.api, 'v1');
    assertEquals(result.response.procedures, undefined);
    assertEquals(result.response.error, {
        code: 'SERVER:UNHANDLED_ERROR',
        message: 'Unhandled error.',
    });
});

Deno.test('Asserting unhandled errors in the [afterAll] hook.', async () => {
    server
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1)
        .afterAll((_context: RequestContext) => {
            throw new Error('custom error');
        })
        .start();

    const result = await httpRequest({
        method: 'POST',
        body: JSON.stringify({
            protocol: 'v1',
            api: 'v1',
            procedures: [
                {
                    id: 'ping',
                    name: 'ping',
                },
            ],
        }),
    });

    assertEquals(result.status, 200);
    assertEquals(result.response.protocol, 'v1');
    assertEquals(result.response.api, 'v1');
    assertEquals(result.response.procedures, undefined);
    assertEquals(result.response.error, {
        code: 'SERVER:UNHANDLED_ERROR',
        message: 'Unhandled error.',
    });
});

Deno.test('Asserting unhandled errors in the [beforeEach] hook.', async () => {
    server
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1)
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .beforeEach(
            (_c: RequestContext, procedure: ProcedureRequestContext) => {
                if (procedure.name == 'hello') {
                    throw new Error('custom error');
                }
            },
        )
        .start();

    const result = await httpRequest({
        method: 'POST',
        body: JSON.stringify({
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
        }),
    });

    assertEquals(result.status, 200);
    assertEquals(result.response.protocol, 'v1');
    assertEquals(result.response.api, 'v1');
    assertEquals(result.response.procedures, {
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
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1)
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .afterEach(
            (_c: RequestContext, procedure: ProcedureRequestContext) => {
                if (procedure.name == 'ping') {
                    throw new Error('custom error');
                }
            },
        )
        .start();

    const result = await httpRequest({
        method: 'POST',
        body: JSON.stringify({
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
        }),
    });

    assertEquals(result.status, 200);
    assertEquals(result.response.protocol, 'v1');
    assertEquals(result.response.api, 'v1');
    assertEquals(result.response.procedures, {
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
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1)
        .registerProcedure(APIs.v1, procedureNames.fail, failingV1)
        .start();

    const result = await httpRequest({
        method: 'POST',
        body: JSON.stringify({
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
        }),
    });

    assertEquals(result.status, 200);
    assertEquals(result.response.protocol, 'v1');
    assertEquals(result.response.api, 'v1');
    assertEquals(result.response.procedures, {
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
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1)
        .beforeAll((_context: RequestContext) => {
            throw new Error('custom error');
        })
        .onError(
            (_context: RequestContext, _error: unknown): JRPCError => {
                return new ApplicationInternalError();
            },
        )
        .start();

    const result = await httpRequest({
        method: 'POST',
        body: JSON.stringify({
            protocol: 'v1',
            api: 'v1',
            procedures: [
                {
                    id: 'ping',
                    name: 'ping',
                },
            ],
        }),
    });

    assertEquals(result.status, 200);
    assertEquals(result.response.protocol, 'v1');
    assertEquals(result.response.api, 'v1');
    assertEquals(result.response.procedures, undefined);
    assertEquals(result.response.error, {
        code: 'APPLICATION:INTERNAL_ERROR',
        message: 'Internal error.',
    });
});

Deno.test('Asserting errors in the [afterAll] hook are handled.', async () => {
    server
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1)
        .afterAll((_context: RequestContext) => {
            throw new Error('custom error');
        })
        .onError(
            (_context: RequestContext, _error: unknown): JRPCError => {
                return new ApplicationInternalError();
            },
        )
        .start();

    const result = await httpRequest({
        method: 'POST',
        body: JSON.stringify({
            protocol: 'v1',
            api: 'v1',
            procedures: [
                {
                    id: 'ping',
                    name: 'ping',
                },
            ],
        }),
    });

    assertEquals(result.status, 200);
    assertEquals(result.response.protocol, 'v1');
    assertEquals(result.response.api, 'v1');
    assertEquals(result.response.procedures, undefined);
    assertEquals(result.response.error, {
        code: 'APPLICATION:INTERNAL_ERROR',
        message: 'Internal error.',
    });
});

Deno.test('Asserting errors in the [beforeEach] hook are handled.', async () => {
    server
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1)
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .beforeEach(
            (_c: RequestContext, procedure: ProcedureRequestContext) => {
                if (procedure.name == 'hello') {
                    throw new Error('custom error');
                }
            },
        )
        .onError(
            (
                _context: RequestContext,
                _error: unknown,
                _procedureContext?: ProcedureRequestContext,
            ): JRPCError => {
                return new ProcedureError();
            },
        )
        .start();

    const result = await httpRequest({
        method: 'POST',
        body: JSON.stringify({
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
        }),
    });

    assertEquals(result.status, 200);
    assertEquals(result.response.protocol, 'v1');
    assertEquals(result.response.api, 'v1');
    assertEquals(result.response.procedures, {
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
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1)
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .afterEach(
            (_c: RequestContext, procedure: ProcedureRequestContext) => {
                if (procedure.name == 'ping') {
                    throw new Error('custom error');
                }
            },
        )
        .onError(
            (
                _context: RequestContext,
                _error: unknown,
                _procedureContext?: ProcedureRequestContext,
            ): JRPCError => {
                return new ProcedureError();
            },
        )
        .start();

    const result = await httpRequest({
        method: 'POST',
        body: JSON.stringify({
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
        }),
    });

    assertEquals(result.status, 200);
    assertEquals(result.response.protocol, 'v1');
    assertEquals(result.response.api, 'v1');
    assertEquals(result.response.procedures, {
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
        .registerProcedure(APIs.v1, procedureNames.ping, pingV1)
        .registerProcedure(APIs.v1, procedureNames.fail, failingV1)
        .onError(
            (
                _context: RequestContext,
                _error: unknown,
                _procedureContext?: ProcedureRequestContext,
            ): JRPCError => {
                return new ProcedureError();
            },
        )
        .start();

    const result = await httpRequest({
        method: 'POST',
        body: JSON.stringify({
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
        }),
    });

    assertEquals(result.status, 200);
    assertEquals(result.response.protocol, 'v1');
    assertEquals(result.response.api, 'v1');
    assertEquals(result.response.procedures, {
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
