import type { z } from "zod";
import type { VideoSchema } from "../schema/getVideosSchema";

export type VideoEntity = z.infer<typeof VideoSchema>