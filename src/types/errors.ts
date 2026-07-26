import type { ErrorResponse } from './server.ts';
import type { ProcedureName } from './common.ts';
import type { ZodError } from 'zod';

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

    PROCEDURE_UNHANDLED_ERROR = 'PROCEDURE:UNHANDLED_ERROR',
    PROCEDURE_INCOMPATIBLE_INPUT = 'PROCEDURE:INCOMPATIBLE_INPUT',
    PROCEDURE_INCOMPATIBLE_OUTPUT = 'PROCEDURE:INCOMPATIBLE_OUTPUT',
    PROCEDURE_NOT_FOUND = 'PROCEDURE:NOT_FOUND',
    PROCEDURE_TIMEOUT = 'PROCEDURE:TIMEOUT',
    PROCEDURE_NOT_AUTHENTICATED = 'PROCEDURE:NOT_AUTHENTICATED',
    PROCEDURE_NOT_AUTHORIZED = 'PROCEDURE:NOT_AUTHORIZED',
    PROCEDURE_NOT_EXECUTED = 'PROCEDURE:NOT_EXECUTED',
}

/**
 * Generic Error class wrapper
 */
export class JRPCError extends Error {
    constructor(
        public code: string,
        public override message: string,
        public details?: Record<string, unknown>,
    ) {
        super(message);
    }
}

/**
 * Error to be thrown when upgrading requests is not supported.
 */
export class ServerUpgradeRequestNotSupported extends JRPCError {
    constructor() {
        super(
            ErrorCodes.SERVER_UPGRADE_REQUEST_NOT_SUPPORTED,
            'Upgrade request not supported.',
        );
    }
}

/**
 * Error to be thrown when the request content exceeds the allowed size.
 */
export class ServerRequestContentTooBig extends JRPCError {
    constructor() {
        super(
            ErrorCodes.SERVER_REQUEST_CONTENT_TOO_BIG,
            'Request content too big.',
        );
    }
}

/**
 * Error to be thrown when the request is being sent using a not supported HTTP method.
 */
export class ServerRequestMethodNotSupported extends JRPCError {
    constructor() {
        super(
            ErrorCodes.SERVER_REQUEST_METHOD_NOT_SUPPORTED,
            'Request method not supported.',
        );
    }
}

/**
 * Error to be thrown when the content of the request is not a JSON or the JSON content does not match the request schema definition.
 */
export class ServerIncompatibleRequestContent extends JRPCError {
    constructor() {
        super(
            ErrorCodes.SERVER_INCOMPATIBLE_REQUEST_CONTENT,
            'Request content is incompatible with the protocol schema.',
        );
    }
}

/**
 * Error to be thrown when the response from the server is not a JSON or the JSON content does not match the response schema definition.
 */
export class ServerIncompatibleResponseContent extends JRPCError {
    constructor() {
        super(
            ErrorCodes.SERVER_INCOMPATIBLE_RESPONSE_CONTENT,
            'Response content is incompatible with the protocol schema.',
        );
    }
}

/**
 * Error to be thrown by the application implementation when the logic detects the request does not provide the right credentials.
 */
export class ServerNotAuthenticated extends JRPCError {
    constructor() {
        super(
            ErrorCodes.SERVER_NOT_AUTHENTICATED,
            'Not authenticated.',
        );
    }
}

/**
 * Error to be thrown by the application implementation when the request is not authorized to proceed.
 */
export class ServerNotAuthorized extends JRPCError {
    constructor() {
        super(
            ErrorCodes.SERVER_NOT_AUTHORIZED,
            'Not authorized.',
        );
    }
}

/**
 * Error to be thrown when the server catches a lower level unhandled error.
 */
export class ServerUnhandledError extends JRPCError {
    constructor(public procedureName?: string, public error?: unknown) {
        super(
            ErrorCodes.SERVER_UNHANDLED_ERROR,
            'Unhandled error.',
        );
    }
}

/**
 * Error to be thrown when the input content of a procedure does not match the resource schema definition.
 */
export class ProcedureIncompatibleInput extends JRPCError {
    constructor(public procedureName: ProcedureName, public zodError: ZodError) {
        super(
            ErrorCodes.PROCEDURE_INCOMPATIBLE_INPUT,
            'Incompatible input content.',
        );
    }
}

/**
 * Error to be thrown when the output content of a procedure does not match the resource schema definition.
 */
export class ProcedureIncompatibleResult extends JRPCError {
    constructor(public procedureName: ProcedureName, public zodError: ZodError) {
        super(
            ErrorCodes.PROCEDURE_INCOMPATIBLE_OUTPUT,
            'Incompatible output content.',
        );
    }
}

/**
 * Error to be thrown when the request is attempting to execute a procedure that has is not registered for the requested API.
 */
export class ProcedureNotFound extends JRPCError {
    constructor() {
        super(ErrorCodes.PROCEDURE_NOT_FOUND, 'Procedure not found.');
    }
}

/**
 * Error to be thrown when a procedure execution exceeds the allowed time.
 */
export class ProcedureTimeout extends JRPCError {
    constructor() {
        super(ErrorCodes.PROCEDURE_TIMEOUT, 'Procedure timed out.');
    }
}

/**
 * Error to be thrown by the application implementation when the logic detects the request does not provide the right credentials.
 */
export class ProcedureNotAuthenticated extends JRPCError {
    constructor() {
        super(
            ErrorCodes.PROCEDURE_NOT_AUTHENTICATED,
            'Not authenticated.',
        );
    }
}

/**
 * Error to be thrown when the application implementation identifies the user is not authorized to execute the procedure.
 */
export class ProcedureNotAuthorized extends JRPCError {
    constructor() {
        super(ErrorCodes.PROCEDURE_NOT_AUTHORIZED, 'Not authorized.');
    }
}

/**
 * Error to be thrown when the server catches a lower level unhandled error.
 */
export class ProcedureUnhandledError extends JRPCError {
    constructor(public procedureName?: string, public error?: unknown) {
        super(
            ErrorCodes.PROCEDURE_UNHANDLED_ERROR,
            'Unhandled error.',
        );
    }
}

/**
 * Maps an error object to an error response.
 */
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

export const CachedErrors: {
    ServerRequestMethodNotSupported: ErrorResponse;
    ServerIncompatibleRequestContent: ErrorResponse;
    ServerIncompatibleResponseContent: ErrorResponse;
    ServerRequestContentTooBig: ErrorResponse;
    ServerUpgradeRequestNotSupported: ErrorResponse;
} = {
    ServerRequestMethodNotSupported: toErrorResponse(new ServerRequestMethodNotSupported()),
    ServerIncompatibleRequestContent: toErrorResponse(new ServerIncompatibleRequestContent()),
    ServerIncompatibleResponseContent: toErrorResponse(new ServerIncompatibleResponseContent()),
    ServerRequestContentTooBig: toErrorResponse(new ServerRequestContentTooBig()),
    ServerUpgradeRequestNotSupported: toErrorResponse(new ServerUpgradeRequestNotSupported()),
};

// Server instance errors

export class InvalidZodDefinition extends Error {
    constructor(public resourceName: string, public zodMessage?: string) {
        super(`Converting a Zod definition to JSON schema failed for resource: ${resourceName}.`);
    }
}
