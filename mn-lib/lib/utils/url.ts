import type { z } from "zod";

export function parseSearchParams<T>(url: URL, schema?: z.ZodType<T>): T | Record<string, string>{
    let params: Record<string, string> = {};
   for(const [k, v] of  url.searchParams.entries()){
    params[k] = v;
   }
    return  schema?.parse(params) ?? params;
}
