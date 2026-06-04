declare const __brand: unique symbol;
type Brand<B> = { [__brand]: B };
export type Branded<T, B> = T & Brand<B>;

export type ProtocolVersion = Branded<string, 'ProtocolVersion'>;
export type Api = Branded<string, 'Api'>;
export type ProcedureRequestId = Branded<string, 'ProcedureRequestId'>;
export type ProcedureName = Branded<string, 'ProcedureName'>;
export type ResourceName = Branded<string, 'ResourceName'>;
export type WebSocketId = Branded<string, 'WebSocketId'>;

export const ProtocolVersions = {
    v1: 'v1' as ProtocolVersion,
};

export enum HttpMethod {
    GET = 'GET',
    POST = 'POST',
    OPTIONS = 'OPTIONS',
}

export enum Environment {
    DEV = 'development',
    STAGING = 'staging',
    PRODUCTION = 'production',
}
