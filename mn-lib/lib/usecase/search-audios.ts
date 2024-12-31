import type { Usecase, Result } from "./usecase";
import { z } from "zod";
import { FirestoreDataSource } from "../firebase/firestore-node";
import { Query, Timestamp } from "@google-cloud/firestore";
import { AssetTagSchema, type AudioAsset, AudioAssetSchema } from "../models/media-assets";

export const SearchAudioUsecaseArgsSchema = z.object({
    searchTags: AssetTagSchema.array().default(['any']),
    limit: z.coerce.number().default(10),
    pageNumber: z.coerce.number().default(1),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional()
});

export type SearchAudioUsecaseArgs = z.infer<typeof SearchAudioUsecaseArgsSchema>;

export const AUDIO_ASSETS_COLLECTION = "AUDIO_ASSETS";
const defaults = {
    searchTags: ["any"],
    orderBy: "releaseDate,desc",
    limit: 20
};

export default class SearchAudiosUsecase implements Usecase<AudioAsset[], SearchAudioUsecaseArgs>{
    constructor(private readonly dataSource = FirestoreDataSource.getInstance()) { }
    async execute(usecaseArgs: SearchAudioUsecaseArgs) {

        const { searchTags, orderBy, limit, pageNumber = 1, startDate, endDate } = { ...defaults, ...usecaseArgs };
        try {
            let query: Query = this.dataSource.collection(AUDIO_ASSETS_COLLECTION);
            const [property, order] = orderBy.split(",");

            query = query.where("tags", "array-contains-any", searchTags);

            query = query.orderBy(property, order as "desc" | "asc");
            if (startDate) {
                query = query.where("releaseDate", ">=", Timestamp.fromDate(startDate));
            }
            if (endDate) {
                query = query.where("releaseDate", "<=", Timestamp.fromDate(endDate));
            }
            const startAfter = (pageNumber - 1) * limit;

            query = query.offset(startAfter).limit(limit);

            const audios = await this.dataSource.findAllDocs(query);

            const parsedAUdios = audios.map((audio: any) => {
                const releaseDate = new Date(audio.releaseDate.toString());
                const video = audio.video ? { ...audio.video, releaseDate } : null;
                const transcription = audio.transcription ? { ...audio.transcription, releaseDate } : null;

                return AudioAssetSchema.parse({
                    ...audio,
                    releaseDate,
                    video,
                    transcription
                })
            });


            const result: Result<AudioAsset[]> = {
                ok: true,
                value: parsedAUdios
            }
            return result;
        } catch (e) {
            const message = e instanceof Error ? e.message : `error searching audios`;
            const error: Result<AudioAsset[]> = {
                ok: false,
                error: new Error(message)
            }
            return error;
        }
    }

}
