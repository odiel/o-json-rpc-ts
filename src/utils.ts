export function serializeError(e: unknown) {
    return JSON.parse(
        JSON.stringify(e, Object.getOwnPropertyNames(e)),
    );
}
