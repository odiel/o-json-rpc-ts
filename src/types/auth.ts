export type AuthenticationSession = {
    scheme: 'session';
    token: string;
    token_type: 'plain-text' | 'base64';
};

export type AuthenticationApiKey = {
    scheme: 'api_key';
    token: string;
    token_type: 'plain-text' | 'base64';
};

export type AuthenticationToken = {
    scheme: 'access_token' | 'refresh_token';
    token: string;
    token_type: 'jwt';
};

export type AuthenticationIdentifyProvider = {
    scheme: 'identity_provider';
    token: string;
    token_type: string;
    provider: string;
};

export type Authentication = AuthenticationApiKey | AuthenticationSession | AuthenticationToken | AuthenticationIdentifyProvider;
