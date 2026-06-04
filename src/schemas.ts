import * as z from 'zod';

import requestSchema from './schemas/v1/request.json' with {
    type: 'json',
};
import responseSchema from './schemas/v1/response.json' with {
    type: 'json',
};

export const protocolRequestSchema = z.fromJSONSchema(
    // deno-lint-ignore no-explicit-any
    requestSchema as any,
);

export const protocolResponseSchema = z.fromJSONSchema(
    // deno-lint-ignore no-explicit-any
    responseSchema as any,
);
