import { assertEquals } from '@std/assert';
import type { Api, ProtocolVersion, RequestContext, ResourceContent, ResourceName, Server, WebSocketId } from '../src/index.ts';
import { LogLevel } from '../src/index.ts';
import { APIs, Greeting, HelloInputV1, helloV1, helloV2, procedureNames } from './procedures.ts';

import { createServer, httpRequest, serverLogger, sleep, stopServer, subscribeToResource } from './common.ts';

let server: Server;

Deno.test.beforeEach(() => {
    server = createServer();
});

Deno.test.afterEach(async () => {
    await stopServer(server);
});

Deno.test('Subscription request for a non registered API logs out a warning.', async () => {
    server
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .start();

    const sws = subscribeToResource('v1', [{ resource_name: Greeting.name }], (_) => {});

    await sleep(5);
    sws.close(1000);

    serverLogger.assertLog(LogLevel.WARNING, 'Subscription handler registration not found for API [v1].');
});

Deno.test('Subscription request for a non registered resource logs out a warning.', async () => {
    server
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerSubscription(APIs.v1, Greeting.name)
        .start();

    const sws = subscribeToResource('v1', [{ resource_name: HelloInputV1.name }], (_) => {});

    await sleep(5);
    sws.close(1000);

    serverLogger.assertLog(LogLevel.WARNING, 'Subscription handler registration not found for API [v1] and resource [HelloInput].');
});

Deno.test('Asserting subscription connection.', async () => {
    server
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerSubscription(APIs.v1, Greeting.name)
        .start();

    const subscriptionEntries: Record<string, unknown>[] = [];

    const sws = subscribeToResource('v1', [{ resource_name: Greeting.name }], (message) => {
        subscriptionEntries.push(message);
    });

    await sleep(5);
    sws.close(1000);

    assertEquals(subscriptionEntries.length, 1);
    assertEquals(subscriptionEntries[0], {
        protocol: 'v1',
        api: 'v1',
    });
});

Deno.test('Asserting resource changes are broadcast to subscribers.', async () => {
    const subscriber1Entries: unknown[] = [];
    const subscriber2Entries: unknown[] = [];
    const subscriber3Entries: unknown[] = [];

    server
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerSubscription(APIs.v1, Greeting.name)
        .registerResource(APIs.v2, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v2, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v2, procedureNames.hello, helloV2, { input: HelloInputV1.name, output: Greeting.name })
        .registerSubscription(APIs.v2, Greeting.name)
        .start();

    const sws1 = subscribeToResource('v1', [{ resource_name: Greeting.name }], (message) => {
        subscriber1Entries.push(message);
    });

    const sws2 = subscribeToResource('v1', [{ resource_name: Greeting.name }], (message) => {
        subscriber2Entries.push(message);
    });

    // ensuring resources are not leaked between API versions
    const sws3 = subscribeToResource('v2', [{ resource_name: Greeting.name }], (message) => {
        subscriber3Entries.push(message);
    });

    await sleep(5);

    await httpRequest({
        method: 'POST',
        body: JSON.stringify({
            protocol: 'v1',
            api: 'v1',
            procedures: [
                {
                    id: 'helloWorld',
                    name: 'hello',
                    input: 'World',
                },
                {
                    id: 'helloEarth',
                    name: 'hello',
                    input: 'Earth',
                },
            ],
        }),
    });

    await httpRequest({
        method: 'POST',
        body: JSON.stringify({
            protocol: 'v1',
            api: 'v2',
            procedures: [
                {
                    id: 'helloWorld',
                    name: 'hello',
                    input: 'World',
                },
            ],
        }),
    });

    await sleep(5);

    sws1.close(1000);
    sws2.close(1000);
    sws3.close(1000);

    assertEquals(subscriber1Entries.length, 3);
    assertEquals(subscriber1Entries[0], {
        protocol: 'v1',
        api: 'v1',
    });
    assertEquals(subscriber1Entries[1], { resource_name: 'Greeting', resource: { greeting: 'Hello World!' } });
    assertEquals(subscriber1Entries[2], { resource_name: 'Greeting', resource: { greeting: 'Hello Earth!' } });

    assertEquals(subscriber2Entries.length, 3);
    assertEquals(subscriber2Entries[0], {
        protocol: 'v1',
        api: 'v1',
    });
    assertEquals(subscriber2Entries[1], { resource_name: 'Greeting', resource: { greeting: 'Hello World!' } });
    assertEquals(subscriber2Entries[2], { resource_name: 'Greeting', resource: { greeting: 'Hello Earth!' } });

    assertEquals(subscriber3Entries.length, 2);
    assertEquals(subscriber3Entries[0], {
        protocol: 'v1',
        api: 'v2',
    });
    assertEquals(subscriber3Entries[1], { resource_name: 'Greeting', resource: { greeting: 'Hi there, World!' } });
});

Deno.test('Asserting subscription handler hooks.', async () => {
    const hooksCalled: Record<string, string[]> = {};
    const resourceUpdatedCalls: { name: string; resource: ResourceContent }[] = [];

    function onClientConnect(websocketId: WebSocketId, _context: RequestContext) {
        hooksCalled[websocketId] = [];
        hooksCalled[websocketId].push('client_connected');
    }

    function onClientDisconnect(websocketId: WebSocketId, _context: RequestContext) {
        hooksCalled[websocketId].push('client_disconnected');
    }

    function onResourceUpdate(_protocolVersion: ProtocolVersion, _api: Api, name: ResourceName, resource: ResourceContent) {
        resourceUpdatedCalls.push({ name, resource });
        return resource;
    }

    const subscriber1Entries: unknown[] = [];
    const subscriber2Entries: unknown[] = [];

    server
        .registerResource(APIs.v1, HelloInputV1.name, HelloInputV1.schema)
        .registerResource(APIs.v1, Greeting.name, Greeting.schema)
        .registerProcedure(APIs.v1, procedureNames.hello, helloV1, { input: HelloInputV1.name, output: Greeting.name })
        .registerSubscription(APIs.v1, Greeting.name, { onClientConnect, onClientDisconnect, onResourceUpdate })
        .start();

    const sws1 = subscribeToResource('v1', [{ resource_name: Greeting.name }], (message) => {
        subscriber1Entries.push(message);
    });

    const sws2 = subscribeToResource('v1', [{ resource_name: Greeting.name }], (message) => {
        subscriber2Entries.push(message);
    });

    await sleep(5);

    await httpRequest({
        method: 'POST',
        body: JSON.stringify({
            protocol: 'v1',
            api: 'v1',
            procedures: [
                {
                    id: 'helloWorld',
                    name: 'hello',
                    input: 'World',
                },
                {
                    id: 'helloEarth',
                    name: 'hello',
                    input: 'Earth',
                },
            ],
        }),
    });

    await sleep(5);

    sws1.close(1000);
    sws2.close(1000);

    await sleep(5);

    assertEquals(subscriber1Entries.length, 3);
    assertEquals(subscriber1Entries[0], {
        protocol: 'v1',
        api: 'v1',
    });
    assertEquals(subscriber1Entries[1], { resource_name: 'Greeting', resource: { greeting: 'Hello World!' } });
    assertEquals(subscriber1Entries[2], { resource_name: 'Greeting', resource: { greeting: 'Hello Earth!' } });

    assertEquals(subscriber2Entries.length, 3);
    assertEquals(subscriber2Entries[0], {
        protocol: 'v1',
        api: 'v1',
    });
    assertEquals(subscriber2Entries[1], { resource_name: 'Greeting', resource: { greeting: 'Hello World!' } });
    assertEquals(subscriber2Entries[2], { resource_name: 'Greeting', resource: { greeting: 'Hello Earth!' } });

    const websocketIds = Object.keys(hooksCalled);
    assertEquals(websocketIds.length, 2);
    assertEquals(hooksCalled[websocketIds[0]], ['client_connected', 'client_disconnected']);
    assertEquals(hooksCalled[websocketIds[1]], ['client_connected', 'client_disconnected']);

    assertEquals(resourceUpdatedCalls, [
        {
            name: 'Greeting',
            resource: { greeting: 'Hello World!' },
        },
        {
            name: 'Greeting',
            resource: { greeting: 'Hello Earth!' },
        },
    ]);
});
