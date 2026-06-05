import type { Json, JSONSchema } from './json.ts';
import type { Api, ProcedureName, ProcedureRequestId, ProtocolVersion, ResourceName, WebSocketId } from './common.ts';
import type { ZodType } from 'zod';
import type { Authentication } from './auth.ts';

export type ResourceContent = Json;

export type Resource = { name: ResourceName; schema: ZodType };

export type ServerRequest = {
    protocol: ProtocolVersion;
    api: Api;
    procedures?: ProcedureRequestContext[];
    subscriptions?: { resource_name: ResourceName }[];
    options?: RequestOptions;
};

export type ProcedureRegistry = {
    api: Api;
    name: ProcedureName;
    fn: ProcedureHandlerFunction;
    input?: ResourceName;
    output?: ResourceName;
};

export type ProcedureHandlerFunction = (
    procedureContext: ProcedureRequestContext,
    context: RequestContext,
) => ProcedureResult | Promise<ProcedureResult>;

export type ProcedureResult =
    | { result: Json }
    | { error: ErrorResponse }
    | undefined
    | void;

export type ProcedureRequestContext = {
    id: ProcedureRequestId;
    name: ProcedureName;
    input?: ResourceContent;
};

export type SubscriptionRegistry = {
    api: Api;
    resourceName: ResourceName;
    onClientConnect?: SubscriptionOnClientConnectFn;
    onClientDisconnect?: SubscriptionOnClientDisconnectFn;
    onResourceUpdate?: SubscriptionOnResourceUpdateFn;
};

export type SubscriptionOnClientConnectFn = (
    websocketId: WebSocketId,
    context: RequestContext,
) => void | Promise<void>;
export type SubscriptionOnClientDisconnectFn = (websocketId: WebSocketId, context: RequestContext) => void | Promise<void>;
export type SubscriptionOnResourceUpdateFn = (protocolVersion: ProtocolVersion, api: Api, name: ResourceName, resource: ResourceContent) => ResourceContent | Promise<ResourceContent>;

export type RequestContext = {
    /**
     * O-JSON-RPC protocol version
     */
    protocol: ProtocolVersion;

    /**
     * API value used in the request
     */
    api: Api;

    /**
     * Environment in which the server is running
     */
    env: string;

    /**
     * Information provided in the options section of the request
     */
    request: {
        id: string;
        options: RequestOptions;
    };

    /**
     * Utility function to use from the procedure execution to notify subscribers
     * @param resourceName - Name of the resource to notify ab out
     * @param resource - Resource content
     */
    notifySubscribers: (resourceName: ResourceName, resource: Json) => void;

    /**
     * ID assigned by the server to the websocket connection
     */
    websocketId?: WebSocketId;

    /**
     * Any custom value set in the request context either by the hooks or procedures execution
     */
    customValues?: Record<string, unknown>;
};

export type ProcedureExecution = {
    executionTime: number;
    timedOut: boolean;
    result: ProcedureResult;
};

export enum ExecutionStrategy {
    SEQUENTIAL = 'sequential',
    PARALLEL = 'parallel',
}

export type RequestOptions = {
    /**
     * Id of the request to keep track of it for logs and metrics; it also serves a purpose for the client to track requests
     * This id is returned in the response when `return.request_id` is true
     */
    request_id?: string;

    /**
     * Section to configure different options for the execution of the request
     */
    execution?: {
        /**
         * Tells the server how to process the list of procedures
         * sequential - executes one procedure at the time, once one procedure is done moves to the next one in the request
         * parallel - executes all procedures at the same time and collects and returns the results after all procedures are completed
         */
        strategy?: ExecutionStrategy;

        /**
         * Timeout value for each procedure execution
         */
        procedure_timeout?: number;
    };

    /**
     * Section to define how the request should be authenticated
     */
    authentication?: Authentication;

    /**
     * Options to inform the server to return in the response.
     * Used mostly for debugging and performance analysis purposes.
     *
     * request.id - asks the server to return the request id assigned by the server to the request
     * request.execution_time - Asks the server to return how long took for the request to be fully processed
     * procedure.order - Asks the server to return details like execution time, timed out and execution order for each procedure execution
     * procedure.execution_time - Asks the server to return details like execution time, timed out and execution order for each procedure execution
     */
    return?: string[];
};

// --

export type ProcedureResponse = {
    result: Json;
} | {
    error: ErrorResponse;
} | null;

export type ServerResultsResponse = {
    protocol: ProtocolVersion;
    api: Api;
    procedures?: Record<ProcedureRequestId, ProcedureResponse>;
    details?: ServerResponseDetails;
};

export type ServerErrorResponse = {
    protocol: ProtocolVersion;
    api: Api | 'unknown';
    error?: ErrorResponse;
    requestDetails?: ServerResponseDetails;
};

export type ServerResponseDetails = {
    request_id?: string;
    execution_time?: number;
    procedures_execution?: Record<ProcedureRequestId, {
        procedure: string;
        order?: number;
        execution_time_ms?: number;
        timed_out?: boolean;
    }>;
};

export type ErrorResponse = {
    code: string;
    message?: string;
    details?: Record<string, unknown>;
};

export type ServerWebSocket = WebSocket & { id: WebSocketId };

export type APIDefinition = {
    protocol: ProtocolVersion | string;
    apis: Record<
        Api | string,
        {
            procedures: Record<string, {
                input?: string;
                output?: string;
            }>;
            subscriptions: string[];
            resources: Record<ResourceName | string, JSONSchema>;
        }
    >;
};
