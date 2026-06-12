import { assertEquals } from '@std/assert';
import type { ProcedureRequestContext, ProcedureResult, RequestContext, Server } from '../src/index.ts';
import { APIs } from './procedures.ts';

import { createServer, httpRequest, stopServer } from './common.ts';

let server: Server;

Deno.test.beforeEach(() => {
    server = createServer();
});

Deno.test.afterEach(async () => {
    await stopServer(server);
});

Deno.test('Managing custom values in the request context.', async () => {
    server
        .registerProcedure(APIs.v1, 'contextWriter', (_procedureContext, context) => {
            context.customValues.set('procedure', true);
        })
        .registerProcedure(APIs.v1, 'contextReader', (_procedureContext: ProcedureRequestContext, context: RequestContext): ProcedureResult => {
            return {
                result: {
                    contextValues: {
                        global: context.customValues.get('global')!,
                        procedure: context.customValues.get('procedure')!,
                    },
                },
            };
        })
        .beforeAll((context: RequestContext) => {
            context.customValues.set('global', 'value');
        })
        .start();

    const result = await httpRequest({
        method: 'POST',
        body: JSON.stringify({
            protocol: 'v1',
            api: 'v1',
            procedures: [
                {
                    id: 'contextWriter',
                    name: 'contextWriter',
                },
                {
                    id: 'contextReader',
                    name: 'contextReader',
                },
            ],
            options: {
                execution: {
                    strategy: 'sequential',
                },
            },
        }),
    });

    assertEquals(result.status, 200);

    assertEquals(result.response, {
        protocol: 'v1',
        api: 'v1',
        procedures: {
            contextWriter: {
                result: null,
            },
            contextReader: {
                result: {
                    contextValues: { global: 'value', procedure: true },
                },
            },
        },
    });
});
