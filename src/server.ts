import type { ZodType } from 'zod';
import type {
    AbstractLogger,
    Api,
    APIDefinition,
    ErrorName,
    JSONSchema,
    ProcedureExecution,
    ProcedureHandlerFunction,
    ProcedureName,
    ProcedureRegistry,
    ProcedureRequestContext,
    ProcedureRequestId,
    ProcedureResult,
    ProtocolVersion,
    RequestContext,
    ResourceContent,
    ResourceName,
    ServerErrorResponse,
    ServerRequest,
    ServerResponse,
    ServerWebSocket,
    SubscriptionOnClientConnectFn,
    SubscriptionOnClientDisconnectFn,
    SubscriptionOnResourceUpdateFn,
    SubscriptionRegistry,
    WebSocketId,
} from './types/index.ts';

import {
    ConsoleLogger,
    ContextCustomValues,
    Environment,
    ExecutionStrategy,
    HttpMethod,
    InvalidZodDefinition,
    JRPCError,
    LogLevel,
    ProcedureIncompatibleInput,
    ProcedureIncompatibleResult,
    ProcedureNotFound,
    ProcedureTimeout,
    ProtocolVersions,
    ServerIncompatibleRequestContent,
    ServerIncompatibleResponseContent,
    ServerInstanceError,
    ServerRequestContentTooBig,
    ServerRequestMethodNotSupported,
    ServerUnhandledError,
    ServerUpgradeRequestNotSupported,
    toErrorResponse,
} from './types/index.ts';

import { protocolRequestSchema, protocolResponseSchema } from './schemas.ts';
import { serializeError } from './utils.ts';

const defaultProcedureTimeout = 3000;

/**
 * O-JSON-RPC Server side implementation.
 */
export class Server {
    private server?: Deno.HttpServer;

    private protocolVersion: ProtocolVersion = ProtocolVersions.v1;

    private config: {
        host: string;
        port: number;
        env: Environment | string;
        cors: {
            accessControlAllowOrigin?: string;
        };
        logger: AbstractLogger;
        request: {
            maxBodySizeBytes: number;
        };
        exposeDefinition: boolean;
    } = {
        host: '127.0.0.1',
        port: 8000,
        env: Environment.DEV,
        cors: {
            accessControlAllowOrigin: '*',
        },
        logger: new ConsoleLogger(LogLevel.DEBUG),
        request: {
            maxBodySizeBytes: 128 * 1024,
        },
        exposeDefinition: true,
    };

    /**
     * Registered resources per API.
     */
    private resourceDefinitions = new Map<Api, Record<ResourceName, ZodType>>();

    /**
     * Registered errors per API.
     */
    private errorsDefinitions = new Map<Api, Record<ErrorName, ZodType>>();

    /**
     * Registered procedure handlers per API.
     */
    private procedureHandlers = new Map<
        Api,
        Map<
            ProcedureName,
            ProcedureRegistry
        >
    >();

    /**
     * Registered subscription handlers per API.
     */
    private subscriptionHandlers = new Map<
        Api,
        Map<ResourceName, SubscriptionRegistry>
    >();

    /**
     * List of websocket connections for a combination of API and resource.
     */
    private resourceConnections = new Map<
        `${Api}:${ResourceName}`,
        Map<WebSocketId, ServerWebSocket>
    >();

    /**
     * List of connected websocket clients.
     */
    private connectedWebsockets = new Map<string, ServerWebSocket>();

    /**
     * CORS headers definition.
     */
    private corsHeaders: Record<string, string>;

    /**
     * Generated API definition.
     */
    private apiDefinition?: APIDefinition;

    /**
     * Callback function to execute as first step of a request before processing any procedure.
     */
    private beforeAllFunc?: (
        context: RequestContext,
    ) => void | Promise<void>;

    /**
     * Callback function to execute before processing each procedure.
     */
    private beforeEachFunc?: (
        context: RequestContext,
        procedure: ProcedureRequestContext,
    ) => void | Promise<void>;

    /**
     * Callback function to execute after processing each procedure.
     */
    private afterEachFunc?: (
        result: ProcedureResult,
        context: RequestContext,
        procedure: ProcedureRequestContext,
    ) => void | Promise<void>;

    /**
     * Callback function to execute after processing all procedures of a request.
     */
    private afterAllFunc?: (
        context: RequestContext,
    ) => void | Promise<void>;

    /**
     * Callback function to execute when an unhandled error occurs.
     */
    private onErrorFunc?: (
        error: unknown,
        context: RequestContext,
        procedureContext?: ProcedureRequestContext,
    ) => JRPCError | Promise<JRPCError>;

    /**
     * Class constructor.
     *
     * @param configuration Object supporting different options to configure the server
     * - host: defines which host the server starts listening for requests; server runs by default on `localhost`
     * - port: which port should be used to listen for requests; 8000 by default
     * - env: sets the environment value in which the server is running; dev is the environment by default
     * - cors: CORS configuration to allow access to the server from client applications; access from all origins is allowed by default
     * - logger: allows to pass a Logger instance; server uses a ConsoleLogger by default
     * - request: options to configure some rules for handling requests
     * - exposeDefinition: exposes the application definition on http://host:port/definition; default value is true
     *
     * Examples:
     * ```ts
     * const server = new Server({ host: 'localhost', port: 8080, env: Environment.PRODUCTION, exposeDefinition: false });
     *
     * const server = new Server({ logger: new MyCustomLogger() });
     *
     * const server = new Server({ request: { maxBodySizeBytes: 1024 }, cors: { accessControlAllowOrigin: 'mydomain.com' } });
     * ```
     */
    constructor(
        configuration?: {
            host?: string;
            port?: number;
            env?: Environment | string;
            cors?: {
                accessControlAllowOrigin?: string;
            };
            logger?: AbstractLogger;
            request?: {
                maxBodySizeBytes?: number;
            };
            exposeDefinition?: boolean;
        },
    ) {
        const allowedHeaders = [
            'Access-Control-Allow-Origin',
            'Access-Control-Allow-Methods',
            'Access-Control-Allow-Headers',
            'Content-Type',
        ];

        this.corsHeaders = {
            'Access-Control-Allow-Method': 'GET, OPTIONS, POST',
            'Access-Control-Allow-Headers': allowedHeaders.join(', '),
        };

        if (configuration?.host) {
            this.config.host = configuration.host;
        }

        if (configuration?.port) {
            this.config.port = configuration.port;
        }

        if (configuration?.env) {
            this.config.env = configuration.env;
        }

        if (configuration?.cors?.accessControlAllowOrigin) {
            this.config.cors.accessControlAllowOrigin = configuration.cors?.accessControlAllowOrigin;
        }

        if (configuration?.logger) {
            this.config.logger = configuration.logger;
        }

        if (configuration?.request?.maxBodySizeBytes) {
            this.config.request.maxBodySizeBytes = configuration.request
                ?.maxBodySizeBytes;
        }

        if (configuration && 'exposeDefinition' in configuration) {
            this.config.exposeDefinition = configuration?.exposeDefinition ?? true;
        }
    }

    /**
     * Registers a resource for an API.
     *
     * @param api API where the resource is registered
     * @param name Name to give to the resource
     * @param schema Zod schema to define the resource structure
     *
     * @throws ServerInstanceError if the resource is already registered
     *
     * ```ts
     * import { Server } from '@o-json-rpc/o-json-rpc-ts';
     * import * as z from 'zod';
     *
     * const zUser = z.object({
     *     id: z.string(),
     *     email: z.string()
     * });
     *
     * const server = new Server();
     * server.registerResource('v1', 'User', zUser);
     * ```
     */
    public registerResource(api: Api | string, name: ResourceName | string, schema: ZodType): Server {
        const apiValue = api as Api;
        const nameValue = name as ResourceName;

        if (!this.resourceDefinitions.get(apiValue)) {
            this.resourceDefinitions.set(apiValue, {});
        }

        const apiResources = this.resourceDefinitions.get(apiValue);

        if (apiResources![nameValue]) {
            const msg = `[${apiValue}]: resource [${nameValue}] is already registered.`;

            this.config.logger.error(
                msg,
            );

            throw new ServerInstanceError(msg);
        }

        this.config.logger.debug(
            `[${apiValue}]: registering resource: ${nameValue}`,
        );

        apiResources![nameValue] = schema;
        return this;
    }

    /**
     * Registers a resource for an API.
     *
     * @param api API where the resource is registered
     * @param name Name to give to the resource
     * @param schema Zod schema to define the resource structure
     *
     * @throws ServerInstanceError if the resource is already registered
     *
     * ```ts
     * import { Server } from '@o-json-rpc/o-json-rpc-ts';
     * import * as z from 'zod';
     *
     * const zUser = z.object({
     *     id: z.string(),
     *     email: z.string()
     * });
     *
     * const server = new Server();
     * server.registerError('v1', 'SERVER:', zUser);
     * ```
     */
    public registerError(api: Api | string, name: ErrorName | string, schema: ZodType): Server {
        const apiValue = api as Api;
        const nameValue = name as ErrorName;

        if (!this.errorsDefinitions.get(apiValue)) {
            this.errorsDefinitions.set(apiValue, {});
        }

        const apiErrors = this.errorsDefinitions.get(apiValue);

        if (apiErrors![nameValue]) {
            const msg = `[${apiValue}]: error [${nameValue}] is already registered.`;

            this.config.logger.error(
                msg,
            );

            throw new ServerInstanceError(msg);
        }

        this.config.logger.debug(
            `[${apiValue}]: registering error: ${nameValue}`,
        );

        apiErrors![nameValue] = schema;
        return this;
    }

    /**
     * Registers a procedure handler for the API.
     *
     * @param api API where the procedure is registered
     * @param procedureName Procedure name; used when calling a procedure in a request
     * @param handler Function to execute when processing a procedure call
     * @param options Optional input and output resource names to validate both the input value incoming in the request and the output result the procedure returns
     *
     * @throws ServerInstanceError if either the input or output resources are not previously registered or if the procedure is already registered
     *
     * ```ts
     * import { Server } from '@o-json-rpc/o-json-rpc-ts';
     *
     * const server = new Server();
     * server
     *      .registerProcedure('v1', 'registerUser', registerUserProcedure, { input: 'UserCredentials', output: 'UserId' });
     *      .registerProcedure('v1', 'getUser', getUserProcedure, { input: 'UserId', output: 'User' });
     * ```
     */
    public registerProcedure(
        api: Api | string,
        procedureName: ProcedureName | string,
        handler: ProcedureHandlerFunction,
        options?: { input?: ResourceName | string; output?: ResourceName | string; errors?: (ErrorName | string)[] },
    ): Server {
        const apiValue = api as Api;
        const procedureNameValue = procedureName as ProcedureName;

        let apiProcedures = this.procedureHandlers.get(apiValue);

        if (!apiProcedures) {
            apiProcedures = new Map<
                ProcedureName,
                ProcedureRegistry
            >();
            this.procedureHandlers.set(
                apiValue,
                apiProcedures!,
            );
        }

        if (apiProcedures!.get(procedureNameValue as ProcedureName)) {
            const msg = `[${apiValue}]: procedure handler [${procedureNameValue}] is already registered.`;

            this.config.logger.error(msg);
            throw new ServerInstanceError(msg);
        }

        const registeredResources = this.resourceDefinitions.get(apiValue);

        if (options?.input) {
            const msg = `[${apiValue}]: input resource [${options.input}] for procedure [${procedureNameValue}] has not been registered yet.`;

            if (!registeredResources) {
                this.config.logger.error(msg);
                throw new ServerInstanceError(msg);
            }

            if (!registeredResources[options.input as ResourceName]) {
                this.config.logger.error(msg);
                throw new ServerInstanceError(msg);
            }
        }

        if (options?.output) {
            const msg = `[${apiValue}]: output resource [${options.output}] for procedure [${procedureNameValue}] has not been registered yet.`;

            if (!registeredResources) {
                this.config.logger.error(msg);
                throw new ServerInstanceError(msg);
            }

            if (!registeredResources[options.output as ResourceName]) {
                this.config.logger.error(msg);
                throw new ServerInstanceError(msg);
            }
        }

        if (options?.errors) {
            const registeredErrors = this.errorsDefinitions.get(apiValue);

            for (const error of options.errors) {
                const msg = `[${apiValue}]: error [${error}] used by procedure [${procedureNameValue}] has not been registered yet.`;

                if (!registeredErrors) {
                    this.config.logger.error(msg);
                    throw new ServerInstanceError(msg);
                }

                if (!registeredErrors[error as ErrorName]) {
                    this.config.logger.error(msg);
                    throw new ServerInstanceError(msg);
                }
            }
        }

        this.config.logger.debug(
            `[${apiValue}]: registering procedure: ${procedureNameValue}`,
        );

        apiProcedures!.set(procedureNameValue as ProcedureName, {
            api: apiValue,
            name: procedureNameValue,
            fn: handler,
            input: options?.input as ResourceName,
            output: options?.output as ResourceName,
            errors: options?.errors,
        });

        return this;
    }

    /**
     * Registers a subscription handler for a resource in an API.
     *
     * @param api API where the subscription is registered
     * @param resourceName Name of the resource to subscribe
     * @param options Hook helper functions for the subscription handler to manage client connects, disconnects and resource updates
     * - onClientConnect: gets called when the server handles a connection from a client to the resourceName
     * - onClientDisconnect: gets called when the registered connection disconnects
     * - onResourceUpdate: gets called when a procedure internally calls `notifySubscribers`
     *
     * @throws ServerInstanceError if either the resource is not previously registered or if there is subscription already registered for the same resource
     *
     * ```ts
     * import { Server } from '@o-json-rpc/o-json-rpc-ts';
     * import * as z from 'zod';
     *
     * const zUser = z.object({
     *     id: z.string(),
     *     email: z.string()
     * });
     *
     *  function onClientConnect(websocketId: WebSocketId, context: RequestContext) {
     *      console.log(websocketId, context);
     *  }
     *
     *  function onClientDisconnect(websocketId: WebSocketId, context: RequestContext) {
     *     console.log(websocketId, context);
     *  }
     *
     *  function onResourceUpdate(protocolVersion: ProtocolVersion, api: Api, name: ResourceName, resource: ResourceContent) {
     *      console.log(protocolVersion, api, name, resource);
     *  }
     *
     * const server = new Server();
     * server
     *      .registerResource('v1', 'User', zUser);
     *      .registerProcedure('v1', 'registerUser', registerUserProcedure, { input: 'UserCredentials', output: 'UserId' });
     *      .registerProcedure('v1', 'getUser', getUserProcedure, { input: 'UserId', output: 'User' });
     *      .registerSubscription('v1, 'User', { onClientConnect, onClientDisconnect, onResourceUpdate })
     * ```
     */
    public registerSubscription(
        api: Api | string,
        resourceName: ResourceName | string,
        options?: {
            onClientConnect?: SubscriptionOnClientConnectFn;
            onClientDisconnect?: SubscriptionOnClientDisconnectFn;
            onResourceUpdate?: SubscriptionOnResourceUpdateFn;
        },
    ): Server {
        const apiValue = api as Api;
        const resourceNameValue = resourceName as ResourceName;

        let apiSubscriptions = this.subscriptionHandlers.get(apiValue);

        if (!apiSubscriptions) {
            apiSubscriptions = new Map<
                ResourceName,
                SubscriptionRegistry
            >();
            this.subscriptionHandlers.set(
                apiValue,
                apiSubscriptions,
            );
        }

        const registeredResource = this.resourceDefinitions.get(apiValue);

        if (!registeredResource) {
            const msg = `[${apiValue}]: subscription for resource [${resourceNameValue}] not possible, resource has not been registered yet.`;

            this.config.logger.error(msg);
            throw new ServerInstanceError(msg);
        }

        if (apiSubscriptions.get(resourceNameValue)) {
            const msg = `[${apiValue}]: subscription handler for [${resourceNameValue}] already registered.`;

            this.config.logger.error(msg);
            throw new ServerInstanceError(msg);
        }

        this.config.logger.debug(
            `[${apiValue}]: registering subscription for resource [${resourceNameValue}]`,
        );

        apiSubscriptions.set(
            resourceNameValue,
            { api: apiValue, resourceName: resourceNameValue, ...options },
        );

        return this;
    }

    /**
     * Sets a callback function to be executed before running any procedure.
     *
     * ```ts
     * import { Server } from '@o-json-rpc/o-json-rpc-ts';
     *
     * const server = new Server();
     * server.beforeAll((context: RequestContext) => {
     *      console.log(context);
     * });
     * ```
     */
    public beforeAll(
        func: (
            context: RequestContext,
        ) => void | Promise<void>,
    ): Server {
        this.beforeAllFunc = func;

        return this;
    }

    /**
     * Sets a callback function to be executed before running each procedure.
     *
     * ```ts
     * import { Server } from '@o-json-rpc/o-json-rpc-ts';
     *
     * const server = new Server();
     * server.beforeAll((context: RequestContext, procedureContext: ProcedureRequestContext) => {
     *      console.log(context, procedureContext);
     * });
     * ```
     */
    public beforeEach(
        func: (
            context: RequestContext,
            procedureContext: ProcedureRequestContext,
        ) => void | Promise<void>,
    ): Server {
        this.beforeEachFunc = func;

        return this;
    }

    /**
     * Sets a callback function to be executed after running each procedure.
     *
     * ```ts
     * import { Server } from '@o-json-rpc/o-json-rpc-ts';
     *
     * const server = new Server();
     * server.beforeAll((context: RequestContext, procedureContext: ProcedureRequestContext) => {
     *      console.log(context, procedureContext);
     * });
     * ```
     */
    public afterEach(
        func: (
            result: ProcedureResult,
            context: RequestContext,
            procedure: ProcedureRequestContext,
        ) => void | Promise<void>,
    ): Server {
        this.afterEachFunc = func;

        return this;
    }

    /**
     * Sets a callback function to be executed after all procedures have run.
     *
     * ```ts
     * import { Server } from '@o-json-rpc/o-json-rpc-ts';
     *
     * const server = new Server();
     * server.afterAll((context: RequestContext) => {
     *      console.log(context);
     * });
     * ```
     */
    public afterAll(
        func: (
            context: RequestContext,
        ) => void | Promise<void>,
    ): Server {
        this.afterAllFunc = func;

        return this;
    }

    /**
     * Sets a callback function to be executed when an unhandled error occurs.
     *
     * ```ts
     * import { Server } from '@o-json-rpc/o-json-rpc-ts';
     *
     * const server = new Server();
     * server.afterAll((context: RequestContext) => {
     *      console.log(context);
     * });
     * ```
     */
    public onError(
        func: (
            error: unknown,
            context: RequestContext,
            procedureContext?: ProcedureRequestContext,
        ) => JRPCError | Promise<JRPCError>,
    ): Server {
        this.onErrorFunc = func;

        return this;
    }

    /**
     * Starts the server instance.
     */
    public start(): void {
        const hostname = this.config.host;
        const port = this.config.port;

        this.apiDefinition = this.getAPIDefinition();

        const handler = (req: Request) => {
            return this.requestHandler(req);
        };

        const config = this.config;
        const logger = this.config.logger;

        logger.debug(`Starting server instance.`);

        this.server = Deno.serve({
            hostname,
            port,
            onListen() {
                logger.info(`Server listening for requests on ${hostname}:${port}`);

                if (config.exposeDefinition) {
                    logger.info(`APIs definition at http://${hostname}:${port}/definition`);
                }
            },
        }, handler);

        this.server.finished.then(() => {
            logger.info(`Server closed.`);
        });
    }

    /**
     * Stops the server instance.
     */
    public async stop() {
        this.config.logger.debug(`Stopping server instance.`);

        if (this.server) {
            await this.server.shutdown();
        }
    }

    /**
     * Generates and returns the API Definition object.
     */
    public getAPIDefinition(): APIDefinition {
        const apis: Record<
            string,
            {
                procedures: Record<
                    string,
                    {
                        input?: string;
                        output?: string;
                        errors?: string[];
                    }
                >;
                subscriptions: string[];
                resources: Record<ResourceName, JSONSchema>;
                errors: Record<ErrorName, JSONSchema>;
            }
        > = {};

        for (const [version, resources] of this.resourceDefinitions) {
            if (!apis[version]) {
                apis[version] = { procedures: {}, subscriptions: [], resources: {}, errors: {} };
            }

            for (const [resourceName, schema] of Object.entries(resources)) {
                let jsonSchema: JSONSchema;

                try {
                    jsonSchema = schema.toJSONSchema();
                } catch (e) {
                    if (e instanceof Error) {
                        throw new InvalidZodDefinition(resourceName, e.message);
                    }

                    throw new InvalidZodDefinition(resourceName);
                }

                apis[version].resources[resourceName as ResourceName] = jsonSchema;
            }
        }

        for (const [version, errors] of this.errorsDefinitions) {
            if (!apis[version]) {
                apis[version] = { procedures: {}, subscriptions: [], resources: {}, errors: {} };
            }

            for (const [errorName, schema] of Object.entries(errors)) {
                let jsonSchema: JSONSchema;

                try {
                    jsonSchema = schema.toJSONSchema();
                } catch (e) {
                    if (e instanceof Error) {
                        throw new InvalidZodDefinition(errorName, e.message);
                    }

                    throw new InvalidZodDefinition(errorName);
                }

                apis[version].errors[errorName as ErrorName] = jsonSchema;
            }
        }

        for (const [version, procedures] of this.procedureHandlers) {
            if (!apis[version]) {
                apis[version] = { procedures: {}, subscriptions: [], resources: {}, errors: {} };
            }

            for (const [procedureName, procedure] of procedures) {
                apis[version].procedures[procedureName] = {};
                if (procedure.input) {
                    apis[version].procedures[procedureName].input = `#/resources/${procedure.input}`;
                }

                if (procedure.output) {
                    apis[version].procedures[procedureName].output = `#/resources/${procedure.output}`;
                }

                if (procedure.errors) {
                    if (!apis[version].procedures[procedureName].errors) {
                        apis[version].procedures[procedureName].errors = [];
                    }

                    apis[version].procedures[procedureName].errors = procedure.errors.map((errorCode) => `#/errors/${errorCode}`);
                }
            }
        }

        for (const [version, subscriptions] of this.subscriptionHandlers) {
            if (!apis[version]) {
                apis[version] = { procedures: {}, subscriptions: [], resources: {}, errors: {} };
            }

            for (const [resource, _subscription] of subscriptions) {
                apis[version].subscriptions.push(`#/resources/${resource}`);
            }
        }

        return {
            protocol: this.protocolVersion,
            apis,
        };
    }

    /**
     * Handles incoming requests.
     */
    private async requestHandler(req: Request): Promise<Response> {
        // Checking client origin when the server has a strict access control origin definition
        const clientOrigin = req.headers.get('Origin') ?? '';
        if (
            this.config.cors.accessControlAllowOrigin &&
            this.config.cors.accessControlAllowOrigin != '*' &&
            this.config.cors.accessControlAllowOrigin.indexOf(clientOrigin) == -1
        ) {
            const response: ServerErrorResponse = {
                protocol: this.protocolVersion,
                api: 'unknown',
            };

            return Response.json(response, { status: 403 });
        }

        if (!req.headers.get('upgrade')) {
            return (await this.handleHTTPRequest(req));
        }

        if (req.headers.get('upgrade')!.indexOf('websocket') !== 0) {
            const response: ServerErrorResponse = {
                protocol: this.protocolVersion,
                api: 'unknown',
                error: toErrorResponse(new ServerUpgradeRequestNotSupported()),
            };

            return Response.json(response, { status: 501 });
        }

        return this.handleWebsocketRequest(req);
    }

    /**
     * Handles HTTP requests.
     */
    private async handleHTTPRequest(req: Request): Promise<Response> {
        this.config.logger.debug(`Processing HTTP request`);

        if (req.method === HttpMethod.OPTIONS) {
            return Response.json('', {
                status: 200,
                headers: this.getResponseHeaders(req, true),
            });
        }

        if (req.method === HttpMethod.GET) {
            const url = new URL(req.url);
            if (url.pathname == '/definition' && this.config.exposeDefinition) {
                return this.getHttpResponse(req, this.apiDefinition, 200);
            }
        }

        if (req.method !== HttpMethod.POST) {
            const response: ServerErrorResponse = {
                protocol: this.protocolVersion,
                api: 'unknown',
                error: toErrorResponse(new ServerRequestMethodNotSupported()),
            };

            return this.getHttpResponse(req, response, 405);
        }

        if (!req.body) {
            const response: ServerErrorResponse = {
                protocol: this.protocolVersion,
                api: 'unknown',
                error: toErrorResponse(new ServerIncompatibleRequestContent()),
            };

            return this.getHttpResponse(req, response, 400);
        }

        const bodyReader = req.body.getReader();
        let bodyContent: number[] = [];

        while (true) {
            const chunk = await bodyReader.read();

            if (chunk.done) {
                await bodyReader.cancel();
                break;
            }

            if (
                bodyContent.length + chunk.value.length >
                    this.config.request.maxBodySizeBytes
            ) {
                await bodyReader.cancel();

                const response: ServerErrorResponse = {
                    protocol: this.protocolVersion,
                    api: 'unknown',
                    error: toErrorResponse(new ServerRequestContentTooBig()),
                };

                return this.getHttpResponse(req, response, 400);
            }

            bodyContent = [...bodyContent, ...chunk.value];
        }

        const rawContent = new TextDecoder().decode(
            new Uint8Array(bodyContent),
        );

        let request: ServerRequest;

        try {
            request = JSON.parse(rawContent);
        } catch (_e) {
            const response: ServerErrorResponse = {
                protocol: this.protocolVersion,
                api: 'unknown',
                error: toErrorResponse(new ServerIncompatibleRequestContent()),
            };

            return this.getHttpResponse(req, response, 400);
        }

        try {
            protocolRequestSchema.parse(request);
        } catch (e) {
            const response: ServerErrorResponse = {
                protocol: this.protocolVersion,
                api: 'unknown',
                error: toErrorResponse(new ServerIncompatibleRequestContent()),
            };

            this.config.logger.error('Request failed', {
                error: serializeError(e),
            });

            return this.getHttpResponse(req, response, 400);
        }

        let requestResult;

        try {
            requestResult = await this.processRequest(request);
        } catch (e) {
            let responseError = new ServerUnhandledError();

            if (e instanceof JRPCError) {
                responseError = e;
            }

            const response: ServerErrorResponse = {
                protocol: this.protocolVersion,
                api: request.api,
                error: toErrorResponse(responseError),
            };

            this.config.logger.error('Request processing failed.', {
                error: serializeError(e),
            });

            return this.getHttpResponse(req, response, 200);
        }

        try {
            protocolResponseSchema.parse(requestResult);
        } catch (e) {
            const response: ServerErrorResponse = {
                protocol: this.protocolVersion,
                api: 'unknown',
                error: toErrorResponse(new ServerIncompatibleResponseContent()),
            };

            this.config.logger.error('Response content validation failed.', {
                error: serializeError(e),
            });

            return this.getHttpResponse(req, response, 500);
        }

        return this.getHttpResponse(req, requestResult, 200);
    }

    private getResponseHeaders(req: Request, includeCors?: boolean): Record<string, string> {
        let headers = {
            ['Access-Control-Allow-Origin']: req.headers.get('Origin') ?? '',
        };

        if (includeCors) {
            headers = { ...headers, ...this.corsHeaders };
        }

        return headers;
    }

    private getHttpResponse(req: Request, requestResult: ServerErrorResponse | ServerResponse | APIDefinition | undefined, statusCode: number) {
        return Response.json(requestResult, { status: statusCode, headers: this.getResponseHeaders(req) });
    }

    /**
     * Handles WebSockets requests.
     */
    private handleWebsocketRequest(req: Request): Response {
        this.config.logger.debug(`Processing Websocket request`);

        const webSocketUpgrade = Deno.upgradeWebSocket(req);
        const socket = webSocketUpgrade.socket as ServerWebSocket;

        socket.id = crypto.randomUUID() as WebSocketId;
        this.connectedWebsockets.set(socket.id, socket);

        socket.addEventListener('open', () => {
            this.config.logger.debug(`New websocket connection; id: ${socket.id}.`);
        });

        socket.addEventListener('close', (event: CloseEvent) => {
            this.connectedWebsockets.delete(socket.id);

            if (event.code === 1000) {
                this.config.logger.debug(`Closing websocket connection; websocket id: ${socket.id}.`);
            } else {
                this.config.logger.debug(`Unexpected websocket disconnection; websocket id: ${socket.id}.`, { code: event.code, reason: event.reason });
            }
        });

        socket.addEventListener('error', () => {
            this.config.logger.error(`Websocket error detected; websocket id: ${socket.id}.`);
        });

        socket.addEventListener('message', async (event) => {
            if (!event.data) {
                const response: ServerErrorResponse = {
                    protocol: this.protocolVersion,
                    api: 'unknown',
                    error: toErrorResponse(new ServerIncompatibleRequestContent()),
                };

                socket.send(JSON.stringify(response));
                return;
            }

            //todo: implement reading from ArrayBufferLike | Blob | ArrayBufferView

            if (typeof event.data != 'string') {
                const response: ServerErrorResponse = {
                    protocol: this.protocolVersion,
                    api: 'unknown',
                    error: toErrorResponse(new ServerIncompatibleRequestContent()),
                };

                socket.send(JSON.stringify(response));
                return;
            }

            const dataSize = new TextEncoder().encode(event.data).length;

            if (dataSize > this.config.request.maxBodySizeBytes) {
                const response: ServerErrorResponse = {
                    protocol: this.protocolVersion,
                    api: 'unknown',
                    error: toErrorResponse(new ServerRequestContentTooBig()),
                };

                socket.send(JSON.stringify(response));
                return;
            }

            let request;

            try {
                request = JSON.parse(event.data);
            } catch (_e) {
                const response: ServerErrorResponse = {
                    protocol: this.protocolVersion,
                    api: 'unknown',
                    error: toErrorResponse(new ServerIncompatibleRequestContent()),
                };

                socket.send(JSON.stringify(response));
                return;
            }

            try {
                protocolRequestSchema.parse(request);
            } catch (_e) {
                const response: ServerErrorResponse = {
                    protocol: this.protocolVersion,
                    api: 'unknown',
                    error: toErrorResponse(new ServerIncompatibleRequestContent()),
                };

                socket.send(JSON.stringify(response));
                return;
            }

            let requestResult;

            try {
                requestResult = await this.processRequest(request, socket);
            } catch (e) {
                let responseError = new ServerUnhandledError();

                if (e instanceof JRPCError) {
                    responseError = e;
                }

                const errorResult: ServerErrorResponse = {
                    protocol: this.protocolVersion,
                    api: request.api,
                    error: toErrorResponse(responseError),
                };

                this.config.logger.error('Request failed', {
                    error: serializeError(responseError),
                });

                socket.send(JSON.stringify(errorResult));
                return;
            }

            try {
                protocolResponseSchema.parse(requestResult);
            } catch (e) {
                const response: ServerErrorResponse = {
                    protocol: this.protocolVersion,
                    api: 'unknown',
                    error: toErrorResponse(new ServerIncompatibleResponseContent()),
                };

                this.config.logger.error('Response content validation failed.', {
                    error: serializeError(e),
                });

                socket.send(JSON.stringify(response));
            }

            socket.send(JSON.stringify(requestResult));
            return;
        });

        return webSocketUpgrade.response;
    }

    private async processRequest(
        request: ServerRequest,
        socket?: ServerWebSocket,
    ): Promise<ServerResponse> {
        const requestStartTime = Date.now();

        const { protocol, api: apiVersion, procedures, subscriptions } = request;

        const serverResponse: ServerResponse = {
            protocol: protocol,
            api: apiVersion,
        };

        const context: RequestContext = {
            protocol: request.protocol,
            api: request.api,
            env: this.config.env,
            request: {
                id: request.options?.request_id || crypto.randomUUID(),
                options: request.options || {},
            },
            notifySubscribers: (resourceName: ResourceName, content: ResourceContent) => {
                this.sendResourcesToSubscribers(request.api, resourceName, content);
            },
            customValues: new ContextCustomValues(),
            websocketId: socket?.id,
        };

        if (
            context.request.options.return &&
            context.request.options.return.length > 0
        ) {
            serverResponse.details = {};
        }

        if (socket && subscriptions && subscriptions.length > 0) {
            await this.processSubscriptionsRequest(socket, context, subscriptions);
        }

        try {
            this.beforeAllFunc && await this.beforeAllFunc(context);
        } catch (e) {
            await this.processError(context, e);
        }

        const procedureExecutionDetails: Record<ProcedureRequestId, {
            id: string;
            procedure: string;
            order: number;
            execution_time: number;
            timed_out: boolean;
        }> = {};

        if (procedures) {
            serverResponse.procedures = {};

            if (context.request.options.execution?.strategy == ExecutionStrategy.SEQUENTIAL) {
                let order = 1;

                for (const procedure of procedures) {
                    const raceResult = await this.raceProcedure(context, procedure);

                    procedureExecutionDetails[procedure.id] = {
                        id: procedure.id,
                        procedure: procedure.name,
                        order,
                        timed_out: raceResult.timedOut,
                        execution_time: raceResult.executionTime,
                    };

                    order++;

                    this.populateResponseObject(
                        raceResult.result,
                        procedure,
                        serverResponse,
                    );
                }
            } else {
                const executionOrder: ProcedureRequestId[] = [];
                const executionDetails: Record<
                    ProcedureRequestId,
                    { executionTime: number; timedOut: boolean }
                > = {};

                const promises: Promise<
                    {
                        procedure: ProcedureRequestContext;
                        result: ProcedureResult;
                    } | {
                        procedure: ProcedureRequestContext;
                        error: unknown;
                    }
                >[] = procedures.map((procedure) => {
                    return new Promise((resolve, _) => {
                        resolve(this.raceProcedure(context, procedure));
                    }).then((r) => {
                        const procedureExecution = r as ProcedureExecution;
                        executionOrder.push(procedure.id);
                        executionDetails[procedure.id] = {
                            executionTime: procedureExecution.executionTime,
                            timedOut: procedureExecution.timedOut,
                        };

                        return {
                            procedure,
                            result: procedureExecution.result,
                        };
                    });
                });

                const promiseResults = await Promise.all(promises);

                for (const promiseResult of promiseResults) {
                    if ('result' in promiseResult) {
                        this.populateResponseObject(
                            promiseResult.result,
                            promiseResult.procedure,
                            serverResponse,
                        );
                    }

                    procedureExecutionDetails[promiseResult.procedure.id] = {
                        id: promiseResult.procedure.id,
                        procedure: promiseResult.procedure.name,
                        order: executionOrder.indexOf(promiseResult.procedure.id) + 1,
                        timed_out: executionDetails[promiseResult.procedure.id].timedOut,
                        execution_time: executionDetails[promiseResult.procedure.id].executionTime,
                    };
                }
            }
        }

        try {
            this.afterAllFunc && await this.afterAllFunc(context);
        } catch (e) {
            await this.processError(context, e);
        }

        if (serverResponse.details && context.request.options.return) {
            if (context.request.options.return.includes('request_id')) {
                serverResponse.details.request_id = context.request.id;
            }

            if (context.request.options.return.includes('request_execution_time')) {
                serverResponse.details.execution_time = Date.now() -
                    requestStartTime;
            }

            if (context.request.options.return.includes('procedures_execution_details')) {
                serverResponse.details.procedures_execution = procedureExecutionDetails;
            }
        }

        return serverResponse;
    }

    private async raceProcedure(
        context: RequestContext,
        procedure: ProcedureRequestContext,
    ): Promise<ProcedureExecution> {
        const timeBeforeExecution = Date.now();
        let timedOut: boolean = false;
        let timeOutId: number | undefined;

        const procedureTimeoutPromise = new Promise(
            (_, reject) => {
                timeOutId = setTimeout(
                    () => {
                        reject(new ProcedureTimeout());
                    },
                    context.request.options.execution?.procedure_timeout ||
                        defaultProcedureTimeout,
                );
            },
        );

        let procedureResult;

        try {
            procedureResult = await Promise.race([
                procedureTimeoutPromise,
                this.processProcedure(
                    context,
                    procedure,
                ),
            ]);

            timeOutId && clearTimeout(timeOutId);
        } catch (e) {
            if (e instanceof ProcedureTimeout) {
                timedOut = true;
            }

            procedureResult = { error: toErrorResponse(e) };

            timeOutId && clearTimeout(timeOutId);
        }

        const timeAfterExecution = Date.now();

        return {
            result: procedureResult as ProcedureResult,
            executionTime: timeAfterExecution - timeBeforeExecution,
            timedOut,
        };
    }

    private async processProcedure(
        context: RequestContext,
        procedureRequest: ProcedureRequestContext,
    ): Promise<ProcedureResult> {
        let procedureResult: ProcedureResult;

        try {
            this.beforeEachFunc && await this.beforeEachFunc(context, procedureRequest);
        } catch (e) {
            this.config.logger.error(
                `BeforeEach hook execution failed for procedure: ${procedureRequest.name} (${procedureRequest.id}).`,
                { error: serializeError(e) },
            );

            await this.processError(context, e, procedureRequest);
        }

        try {
            procedureResult = await this.executeProcedure(
                context,
                procedureRequest,
            );
        } catch (e) {
            this.config.logger.error(
                `Procedure execution failed for procedure: ${procedureRequest.name} (${procedureRequest.id}).`,
                { error: serializeError(e) },
            );

            return {
                error: toErrorResponse(e),
            };
        }

        try {
            this.afterEachFunc && await this.afterEachFunc(
                procedureResult,
                context,
                procedureRequest,
            );
        } catch (e) {
            this.config.logger.error(
                `AfterEach hook execution failed for procedure: ${procedureRequest.name} (${procedureRequest.id}).`,
                { error: serializeError(e) },
            );

            await this.processError(context, e, procedureRequest);
        }

        return procedureResult;
    }

    private async executeProcedure(
        context: RequestContext,
        procedureRequest: ProcedureRequestContext,
    ): Promise<ProcedureResult> {
        const apiProcedures = this.procedureHandlers.get(context.api);
        const apiResources = this.resourceDefinitions.get(context.api);

        if (!apiProcedures) {
            throw new ProcedureNotFound();
        }

        const procedureName = procedureRequest.name;
        const procedureHandler = apiProcedures.get(procedureName);

        if (!procedureHandler) {
            throw new ProcedureNotFound();
        }

        // Execute input schema validation
        if (procedureHandler.input && apiResources && apiResources[procedureHandler.input]) {
            try {
                apiResources[procedureHandler.input].parse(procedureRequest.input);
            } catch (_e) {
                throw new ProcedureIncompatibleInput(procedureName);
            }
        }

        let procedureResult: ProcedureResult;

        try {
            procedureResult = await procedureHandler.fn(procedureRequest, context);
        } catch (e) {
            await this.processError(context, e, procedureRequest);
        }

        if (
            procedureHandler.output && procedureResult && 'result' in procedureResult &&
            procedureResult.result && apiResources && apiResources[procedureHandler.output]
        ) {
            try {
                apiResources[procedureHandler.output].parse(procedureResult.result);
            } catch (_e) {
                throw new ProcedureIncompatibleResult(procedureName);
            }
        }

        return procedureResult;
    }

    private async processError(
        context: RequestContext,
        error: unknown,
        procedureContext?: ProcedureRequestContext,
    ): Promise<Error> {
        if (this.onErrorFunc) {
            throw await this.onErrorFunc(error, context, procedureContext);
        }

        if (error instanceof JRPCError) {
            throw error;
        }

        throw new ServerUnhandledError(procedureContext?.name);
    }

    private async processSubscriptionsRequest(
        websocket: ServerWebSocket,
        context: RequestContext,
        resources: { resource_name: ResourceName }[],
    ) {
        const handlersForApi = this.subscriptionHandlers.get(
            context.api,
        );

        if (!handlersForApi) {
            this.config.logger.warning(`Subscription handler registration not found for API [${context.api}].`);
            return;
        }

        for (const resource of resources) {
            const registeredHandler = handlersForApi.get(resource.resource_name);

            if (!registeredHandler) {
                this.config.logger.warning(`Subscription handler registration not found for API [${context.api}] and resource [${resource.resource_name}].`);
                continue;
            }

            const apiAndResourceName: `${Api}:${ResourceName}` = `${context.api}:${resource.resource_name}`;
            let resourceSubscription = this.resourceConnections.get(apiAndResourceName);

            if (!resourceSubscription) {
                this.resourceConnections.set(apiAndResourceName, new Map());

                resourceSubscription = this.resourceConnections.get(apiAndResourceName);
            }

            if (
                resourceSubscription &&
                !resourceSubscription.get(websocket.id)
            ) {
                resourceSubscription.set(websocket.id, websocket);
            }

            websocket.addEventListener('close', () => {
                if (registeredHandler.onClientDisconnect) {
                    registeredHandler.onClientDisconnect(websocket.id, context);
                }

                resourceSubscription && resourceSubscription.delete(websocket.id);
            });

            if (registeredHandler.onClientConnect) {
                await registeredHandler.onClientConnect(websocket.id, context);
            }
        }
    }

    private populateResponseObject(
        procedureResult: ProcedureResult,
        procedure: ProcedureRequestContext,
        response: ServerResponse,
    ) {
        if (!response.procedures) {
            return [];
        }

        if (
            !procedureResult
        ) {
            response.procedures[procedure.id] = { result: null };

            return [];
        }

        if ('error' in procedureResult) {
            response.procedures[procedure.id] = procedureResult;

            return [];
        }

        if (!('result' in procedureResult) || !procedureResult.result) {
            response.procedures[procedure.id] = { result: null };

            return [];
        }

        response.procedures[procedure.id] = procedureResult;
    }

    private async sendResourcesToSubscribers(
        api: Api,
        resourceName: ResourceName,
        content: ResourceContent,
    ) {
        const subscriptionsForApi = this.subscriptionHandlers.get(api);

        if (!subscriptionsForApi) {
            return;
        }

        const subscriptionHandlers = subscriptionsForApi.get(
            resourceName,
        );

        if (!subscriptionHandlers) {
            return;
        }

        let resource = content;

        if (subscriptionHandlers.onResourceUpdate) {
            resource = await subscriptionHandlers.onResourceUpdate(this.protocolVersion, api, resourceName, content);
        }

        const apiAndResourceName: `${Api}:${ResourceName}` = `${api}:${resourceName}`;
        const subscriptionsByTopics = this.resourceConnections.get(apiAndResourceName);

        if (!subscriptionsByTopics) {
            return;
        }

        const websockets = subscriptionsByTopics.values();

        for (const websocket of websockets) {
            websocket.send(
                JSON.stringify({ resource_name: resourceName, resource: resource }),
            );
        }
    }
}
