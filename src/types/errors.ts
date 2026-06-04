import type { ErrorResponse } from './server.ts';
import type {ProcedureName} from './common.ts';

export class ServerInstanceError extends Error {
    constructor(
        public override message: string,
    ) {
        super(message);
    }
}

export enum ErrorCodes {
    SERVER_REQUEST_CONTENT_TOO_BIG = 'SERVER:REQUEST_CONTENT_TOO_BIG',
    SERVER_INCOMPATIBLE_REQUEST_CONTENT = 'SERVER:INCOMPATIBLE_REQUEST_CONTENT',
    SERVER_INCOMPATIBLE_RESPONSE_CONTENT = 'SERVER:INCOMPATIBLE_RESPONSE_CONTENT',
    SERVER_NOT_AUTHENTICATED = 'SERVER:NOT_AUTHENTICATED',
    SERVER_NOT_AUTHORIZED = 'SERVER:NOT_AUTHORIZED',
    SERVER_UNHANDLED_ERROR = 'SERVER:UNHANDLED_ERROR',
    SERVER_DUPLICATED_PROCEDURE_IDS = 'SERVER:DUPLICATED_PROCEDURE_IDS',
    SERVER_UPGRADE_REQUEST_NOT_SUPPORTED = 'SERVER:UPGRADE_REQUEST_NOT_SUPPORTED',
    SERVER_REQUEST_METHOD_NOT_SUPPORTED = 'SERVER:REQUEST_METHOD_NOT_SUPPORTED',

    PROCEDURE_INCOMPATIBLE_INPUT = 'PROCEDURE:INCOMPATIBLE_INPUT',
    PROCEDURE_INCOMPATIBLE_OUTPUT = 'PROCEDURE:INCOMPATIBLE_OUTPUT',
    PROCEDURE_NOT_FOUND = 'PROCEDURE:NOT_FOUND',
    PROCEDURE_TIMEOUT = 'PROCEDURE:TIMEOUT',
    PROCEDURE_NOT_AUTHORIZED = 'PROCEDURE:NOT_AUTHORIZED',
    PROCEDURE_NOT_EXECUTED = 'PROCEDURE:NOT_EXECUTED',
}

export class JRPCError extends Error {
    constructor(
        public code: string,
        public override message: string,
    ) {
        super(message);
    }
}

export class ServerUpgradeRequestNotSupported extends JRPCError {
    constructor() {
        super(
            ErrorCodes.SERVER_UPGRADE_REQUEST_NOT_SUPPORTED,
            'Upgrade request not supported.',
        );
    }
}

export class ServerRequestContentTooBig extends JRPCError {
    constructor() {
        super(
            ErrorCodes.SERVER_REQUEST_CONTENT_TOO_BIG,
            'Request content too big.',
        );
    }
}

export class ServerRequestMethodNotSupported extends JRPCError {
    constructor() {
        super(
            ErrorCodes.SERVER_REQUEST_METHOD_NOT_SUPPORTED,
            'Request method not supported.',
        );
    }
}

export class ServerIncompatibleRequestContent extends JRPCError {
    constructor() {
        super(
            ErrorCodes.SERVER_INCOMPATIBLE_REQUEST_CONTENT,
            'Request content is incompatible with the protocol schema.',
        );
    }
}

export class ServerIncompatibleResponseContent extends JRPCError {
    constructor() {
        super(
            ErrorCodes.SERVER_INCOMPATIBLE_RESPONSE_CONTENT,
            'Response content is incompatible with the protocol schema.',
        );
    }
}

export class ServerNotAuthenticatedError extends JRPCError {
    constructor() {
        super(
            ErrorCodes.SERVER_NOT_AUTHENTICATED,
            'Not authenticated.',
        );
    }
}

export class ServerNotAuthorizedError extends JRPCError {
    constructor() {
        super(
            ErrorCodes.SERVER_NOT_AUTHORIZED,
            'Not authorized.',
        );
    }
}

export class ServerUnhandledError extends JRPCError {
    constructor(public procedureName?: string) {
        super(
            ErrorCodes.SERVER_UNHANDLED_ERROR,
            'Unhandled error.',
        );
    }
}

export class ProcedureIncompatibleInput extends JRPCError {
    constructor(public procedureName: ProcedureName) {
        super(
            ErrorCodes.PROCEDURE_INCOMPATIBLE_INPUT,
            'Incompatible input content.',
        );
    }
}

export class ProcedureIncompatibleResult extends JRPCError {
    constructor(public procedureName: ProcedureName) {
        super(
            ErrorCodes.PROCEDURE_INCOMPATIBLE_OUTPUT,
            'Incompatible output content.',
        );
    }
}

export class ProcedureNotFound extends JRPCError {
    constructor() {
        super(ErrorCodes.PROCEDURE_NOT_FOUND, 'Procedure not found.');
    }
}

export class ProcedureTimeout extends JRPCError {
    constructor() {
        super(ErrorCodes.PROCEDURE_TIMEOUT, 'Procedure timed out.');
    }
}

export class ProcedureNotAuthorized extends JRPCError {
    constructor() {
        super(ErrorCodes.PROCEDURE_NOT_AUTHORIZED, 'Not authorized.');
    }
}

export function toErrorResponse(error: unknown): ErrorResponse {
    if (error instanceof JRPCError) {
        return {
            code: error.code,
            message: error.message,
        };
    }

    return {
        code: ErrorCodes.SERVER_UNHANDLED_ERROR,
        message: 'Unhandled error.',
    };
}


// Other server errors
export class InvalidZodDefinition extends Error {
    constructor(public resourceName: string, public zodMessage?: string) {
        super(`Converting a Zod definition to JSON schema failed for resource: ${resourceName}.`);
    }
}
