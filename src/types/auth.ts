/**
 * Authentication scheme definition for Session based authentications
 */
export type AuthenticationSession = {
    scheme: 'session';
    token: string;
    token_type: 'plain-text' | 'base64';
};

/**
 * Authentication scheme definition for authentications using API Keys
 */
export type AuthenticationApiKey = {
    scheme: 'api_key';
    token: string;
    token_type: 'plain-text' | 'base64';
};

/**
 * Authentication scheme definition for authentications Access and/or Refresh tokens
 */
export type AuthenticationToken = {
    scheme: 'access_token' | 'refresh_token';
    token: string;
    token_type: 'jwt';
};

/**
 * Authentication scheme definition for authentications that require a third party service check
 */
export type AuthenticationIdentifyProvider = {
    scheme: 'identity_provider';
    token: string;
    token_type: string;
    provider: string;
};

export type Authentication = AuthenticationApiKey | AuthenticationSession | AuthenticationToken | AuthenticationIdentifyProvider;
