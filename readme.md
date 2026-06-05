# O-JSON-RPC-TS

[![jsr.io/@o-json-rpc/o-json-rpc-ts](https://jsr.io/badges/@o-json-rpc/o-json-rpc-ts)](https://jsr.io/@o-json-rpc/o-json-rpc-ts)
[![jsr.io/@o-json-rpc/o-json-rpc-ts_score](https://jsr.io/badges/@o-json-rpc/o-json-rpc-ts/score)](https://jsr.io/@o-json-rpc/o-json-rpc-ts)

Typescript implementation of the [O-JSON-RPC](https://github.com/odiel/o-json-rpc) protocol using Deno runtime.

# Installation

O-JSON-RPC-TS is available in [JSR](https://jsr.io/@o-json-rpc/o-json-rpc-ts);

To use it, first add it to your project:

```shell
deno add jsr:@o-json-rpc/o-json-rpc-ts
```

Then import it using

```ts
import { Server } from '@o-json-rpc/o-json-rpc-ts';
```

# Hello World! example

### Creating the server instance

```ts
import { Server } from '@o-json-rpc/o-json-rpc-ts';
import type { ProcedureRequestContext, ProcedureResult, RequestContext } from '@o-json-rpc/o-json-rpc-ts';

const server = new Server({ host: 'localhost', port: 8000 });

const helloWorld = (
    _procedureContext: ProcedureRequestContext,
    _context: RequestContext,
): ProcedureResult => {
    return {
        result: 'Hello World!',
    };
};

server
    .registerProcedure('v1', 'hello', helloWorld)
    .start();
```

### To initialize the server instance execute

```shell
deno run --allow-net .\example.ts
```

### The result of a successful server initialization should be similar to the following logs

```shell
[DEBUG] [2026-06-05T09:29:16.176Z] [v1]: registering procedure: hello
[DEBUG] [2026-06-05T09:29:16.176Z] Starting server instance.
[INFO] [2026-06-05T09:29:16.181Z] Server listening for requests on localhost:8000
[INFO] [2026-06-05T09:29:16.181Z] APIs definition at http://localhost:8000/definition
```

### Use this JSON to send an HTTP request to http://localhost:8000 using your favorite client

```JSON
{
    "protocol": "v1",
    "api": "v1",
    "procedures": [
        {
            "id": "hello",
            "name": "hello"
        }
    ]
}
```

### Server response should look like:

```json
{
    "protocol": "v1",
    "api": "v1",
    "procedures": {
        "hello": {
            "result": "Hello World!"
        }
    }
}
```

# More examples

If you want to take a look at some other examples head to https://github.com/odiel/o-json-rpc-examples
