
export type Result<R, E extends Error = Error> = {
    ok: true;
    value: R
} |  {
    ok: false;
    error: E
};

export interface Usecase<R, A = undefined>{
    execute: (args: A) => Result<R> | Promise<Result<R>>
}