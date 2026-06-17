import { assertEquals, assertMatch } from '@std/assert';
import type { Server } from '../src/index.ts';
import { APIs, authenticateUserV1, getAccountInformationV1, procedureNames, registerUserV1, UserAccount, UserCredentials, UserSession } from './setup/procedures.ts';

import { createServer, httpRequest, stopServer, uuidRegex } from './setup/common.ts';

let server: Server;

Deno.test.beforeEach(() => {
    server = createServer();
});

Deno.test.afterEach(async () => {
    await stopServer(server);
});

Deno.test('Attempting to access a gated procedure returns SERVER:NOT_AUTHENTICATED.', async () => {
    server
        .registerProcedure(APIs.v1, procedureNames.getAccountInformation, getAccountInformationV1)
        .start();

    const result = await httpRequest({
        method: 'POST',
        body: JSON.stringify({
            protocol: 'v1',
            api: 'v1',
            procedures: [
                {
                    id: 'getAccountInformation',
                    name: 'getAccountInformation',
                },
            ],
        }),
    });

    assertEquals(result.status, 200);
    assertEquals(result.response.protocol, 'v1');
    assertEquals(result.response.api, 'v1');
    assertEquals(result.response.procedures, {
        getAccountInformation: {
            error: {
                code: 'SERVER:NOT_AUTHENTICATED',
                message: 'Not authenticated.',
            },
        },
    });
});

Deno.test('Testing Session authentication mechanism.', async (t) => {
    server
        .registerResource(APIs.v1, UserCredentials.name, UserCredentials.schema)
        .registerResource(APIs.v1, UserSession.name, UserSession.schema)
        .registerResource(APIs.v1, UserAccount.name, UserAccount.schema)
        .registerProcedure(APIs.v1, procedureNames.registerUser, registerUserV1, { input: UserCredentials.name, output: UserSession.name })
        .registerProcedure(APIs.v1, procedureNames.authenticateUser, authenticateUserV1, { input: UserCredentials.name, output: UserSession.name })
        .registerProcedure(APIs.v1, procedureNames.getAccountInformation, getAccountInformationV1, { output: UserAccount.name })
        .start();

    let sessionId;

    await t.step('attempting to authenticate without previously registering', async () => {
        const result = await httpRequest({
            method: 'POST',
            body: JSON.stringify({
                protocol: 'v1',
                api: 'v1',
                procedures: [
                    {
                        id: 'authenticateUser',
                        name: 'authenticateUser',
                        input: {
                            email: 'user@emal.com',
                            password: '123abc',
                        },
                    },
                ],
            }),
        });

        assertEquals(result.status, 200);
        assertEquals(result.response.protocol, 'v1');
        assertEquals(result.response.api, 'v1');
        assertEquals(result.response.procedures, {
            authenticateUser: {
                error: {
                    code: 'APPLICATION:AUTHENTICATION_FAILED',
                    message: 'Authentication failed.',
                },
            },
        });
    });

    await t.step('registering and authenticating', async () => {
        const result = await httpRequest({
            method: 'POST',
            body: JSON.stringify({
                protocol: 'v1',
                api: 'v1',
                procedures: [
                    {
                        id: 'registerUser',
                        name: 'registerUser',
                        input: {
                            email: 'user@emal.com',
                            password: '123abc',
                        },
                    },
                    {
                        id: 'authenticateUser',
                        name: 'authenticateUser',
                        input: {
                            email: 'user@emal.com',
                            password: '123abc',
                        },
                    },
                ],
            }),
        });

        sessionId = result.response.procedures.authenticateUser.result.sessionId;

        assertEquals(result.status, 200);
        assertEquals(result.response.protocol, 'v1');
        assertEquals(result.response.api, 'v1');
        assertMatch(result.response.procedures.registerUser.result.sessionId, uuidRegex);
        assertMatch(result.response.procedures.authenticateUser.result.sessionId, uuidRegex);
    });

    await t.step('calling a procedure that requires authentication after authenticated', async () => {
        const result = await httpRequest({
            method: 'POST',
            body: JSON.stringify({
                protocol: 'v1',
                api: 'v1',
                procedures: [
                    {
                        id: 'getAccountInformation',
                        name: 'getAccountInformation',
                    },
                ],
                options: {
                    authentication: {
                        scheme: 'session',
                        token: sessionId!,
                        token_type: 'plain-text',
                    },
                },
            }),
        });

        assertEquals(result.status, 200);
        assertEquals(result.response.protocol, 'v1');
        assertEquals(result.response.api, 'v1');
        assertEquals(result.response.procedures.getAccountInformation.result.email, 'user@emal.com');
    });
});
