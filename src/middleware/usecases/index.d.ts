import { Result } from "@badrap/result";
import { InternalFailure } from "../errors/failures";

export interface UseCase<T, R> {
    execute(args: T): Promise<Result<R, InternalFailure>>;
}