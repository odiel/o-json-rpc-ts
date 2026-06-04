import type { Api, ProcedureName, ProcedureRequestContext, ProcedureResult, RequestContext, Resource, ResourceName } from '../src/index.ts';
import { ServerNotAuthenticatedError } from '../src/index.ts';
import { JRPCError } from '../src/index.ts';

import { sleep } from './common.ts';

import * as z from 'zod';

export const APIs = {
    v1: 'v1' as Api,
    v2: 'v2' as Api,
};

export const procedureNames = {
    hello: 'hello' as ProcedureName,
    badHello: 'badHello' as ProcedureName,
    delayedHello: 'delayedHello' as ProcedureName,
    ping: 'ping' as ProcedureName,
    report: 'report' as ProcedureName,
    fail: 'fail' as ProcedureName,
    registerUser: 'registerUser' as ProcedureName,
    authenticateUser: 'authenticateUser' as ProcedureName,
    getAccountInformation: 'getAccountInformation' as ProcedureName,
};

// ZOD types

export const helloInputV1 = z.string();
export const helloInputV2 = z.object({
    firstName: z.string(),
    lastName: z.string(),
});

export const greeting = z.object({
    greeting: z.string(),
});

export const pong = z.string();

export const userCredentialsInputV1 = z.object({
    email: z.string(),
    password: z.string(),
});

export const userSessionOutputV1 = z.object({
    sessionId: z.string(),
});

export const userAccountOutputV1 = z.object({
    email: z.string(),
    registrationDate: z.string(),
});

// TS types

export type HelloInputTypeV1 = z.infer<typeof helloInputV1>;
export type HelloInputTypeV2 = z.infer<typeof helloInputV2>;

export type UserCredentialsInputTypeV1 = z.infer<typeof userCredentialsInputV1>;

// Resource definition

export const HelloInputV1: Resource = {
    name: 'HelloInput' as ResourceName,
    schema: helloInputV1,
};

export const HelloInputV2: Resource = {
    name: 'HelloInput' as ResourceName,
    schema: helloInputV2,
};

export const Greeting: Resource = {
    name: 'Greeting' as ResourceName,
    schema: greeting,
};

export const Pong: Resource = {
    name: 'Pong' as ResourceName,
    schema: pong,
};

export const UserCredentials: Resource = {
    name: 'UserCredentials' as ResourceName,
    schema: userCredentialsInputV1,
};

export const UserSession: Resource = {
    name: 'UserSession' as ResourceName,
    schema: userSessionOutputV1,
};

export const UserAccount: Resource = {
    name: 'UserAccount' as ResourceName,
    schema: userAccountOutputV1,
};

export function helloV1(
    procedureContext: ProcedureRequestContext,
    context: RequestContext,
): ProcedureResult {
    if (procedureContext.input) {
        const input = procedureContext.input as HelloInputTypeV1;

        const result = {
            greeting: `Hello ${input}!`,
        };

        context.notifySubscribers(Greeting.name, result);

        return {
            result,
        };
    }
}

export function badHelloV1(
    procedureContext: ProcedureRequestContext,
): ProcedureResult {
    if (procedureContext.input) {
        return {
            result: {
                greeting: new Date().getTime(),
            },
        };
    }
}

export async function delayedHelloV1(
    procedureContext: ProcedureRequestContext,
): Promise<ProcedureResult> {
    if (procedureContext.input) {
        await sleep(100);

        const input = procedureContext.input as HelloInputTypeV1;

        return {
            result: {
                greeting: `Hello ${input}!`,
            },
        };
    }
}

export function pingV1(
    _procedureContext: ProcedureRequestContext,
): ProcedureResult {
    return {
        result: 'pong!',
    };
}

export function failingV1(
    _c: ProcedureRequestContext,
): ProcedureResult {
    throw new Error('Procedure failure');
}

export function helloV2(
    procedureContext: ProcedureRequestContext,
    context: RequestContext,
): ProcedureResult {
    if (procedureContext.input) {
        const input = procedureContext.input as HelloInputTypeV1;

        const result = {
            greeting: `Hi there, ${input}!`,
        };

        context.notifySubscribers(`Greeting` as ResourceName, result);

        return {
            result,
        };
    }
}

export function reportV2(
    _c: ProcedureRequestContext,
): ProcedureResult {
    return;
}

const registeredUsers: Record<string, { password: string; registrationDate: Date }> = {};
const userSession: Record<string, { sessionId: string; validUntil: Date }> = {};
const sessions: Record<string, string> = {};

export function registerUserV1(
    procedureContext: ProcedureRequestContext,
    _context: RequestContext,
): ProcedureResult {
    if (procedureContext.input) {
        const input = procedureContext.input as UserCredentialsInputTypeV1;

        registeredUsers[input.email] = { password: input.password, registrationDate: new Date() };
        const session = { sessionId: crypto.randomUUID(), validUntil: new Date() };
        userSession[input.email] = session;
        sessions[session.sessionId] = input.email;

        return {
            result: {
                sessionId: session.sessionId,
            },
        };
    }

    throw new RegistrationFailedError();
}

export function authenticateUserV1(
    procedureContext: ProcedureRequestContext,
    _context: RequestContext,
): ProcedureResult {
    if (procedureContext.input) {
        const input = procedureContext.input as UserCredentialsInputTypeV1;

        if (!registeredUsers[input.email]) {
            throw new AuthenticationFailedError();
        }

        const session = { sessionId: crypto.randomUUID(), validUntil: new Date() };
        userSession[input.email] = session;
        sessions[session.sessionId] = input.email;

        return {
            result: {
                sessionId: session.sessionId,
            },
        };
    }

    throw new RegistrationFailedError();
}

export function getAccountInformationV1(
    _procedureContext: ProcedureRequestContext,
    context: RequestContext,
): ProcedureResult {
    const authentication = context.request.options.authentication;

    if (!authentication) {
        throw new ServerNotAuthenticatedError();
    }

    const sessionId = authentication.token;

    const userEmail = sessions[sessionId];

    if (!userEmail) {
        throw new ServerNotAuthenticatedError();
    }

    const userRegistration = registeredUsers[userEmail];

    if (!userRegistration) {
        throw new ServerNotAuthenticatedError();
    }

    return {
        result: {
            email: userEmail,
            registrationDate: userRegistration.registrationDate.toISOString(),
        },
    };
}

// Errors

export class ApplicationInternalError extends JRPCError {
    constructor() {
        super(
            'APPLICATION:INTERNAL_ERROR',
            'Internal error.',
        );
    }
}

export class ProcedureError extends JRPCError {
    constructor() {
        super(
            'APPLICATION:FAILED_EXECUTION',
            'Procedure failure.',
        );
    }
}

export class RegistrationFailedError extends JRPCError {
    constructor() {
        super(
            'APPLICATION:REGISTRATION_FAILED',
            'Registration failed.',
        );
    }
}

export class AuthenticationFailedError extends JRPCError {
    constructor() {
        super(
            'APPLICATION:AUTHENTICATION_FAILED',
            'Authentication failed.',
        );
    }
}
