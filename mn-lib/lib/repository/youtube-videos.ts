import { Timestamp, type Query, type WriteBatch } from "@google-cloud/firestore";
import { FirestoreDataSource } from "../firebase/firestore-node";
import { YoutubeVideoSchema, YoutubeAudioSchema, type NewYoutubeVideo, type YoutubeVideo, type YoutubeVideoTag, YoutubeVideoTagSchema, SONG_VIDEO_MAX_DURATION } from "../models/youtube";
type GetVideosParams = {
    maxDuration?: number,
    minDuration?: number,
    orderBy?: string,
    limit?: number,
    startAfter?: number
};
type QueryVideosParams = {
    searchTags?: YoutubeVideoTag[],
    orderBy?: string,
    limit?: number,
    pageNumber?: number,
    startDate?: Date,
    endDate?: Date
};
type GetUpcomingVideosParams = {
    orderBy?: string,
    limit?: number
};
export default class YoutubeVideosRepo {
    constructor(private readonly dataStore = FirestoreDataSource.getInstance()) { }
    getYoutubeVideosCollection(channelId = "UCS3zqpqnCvT0SFa_jI662Kg") {
        return `VIDEOS_FROM_YOUTUBE_CHANNELS/${channelId}/YOUTUBE_VIDEOS`;
    }

    getYoutubeLiveVideoCollection(channelId = "UCS3zqpqnCvT0SFa_jI662Kg") {
        return `VIDEOS_FROM_YOUTUBE_CHANNELS/${channelId}/YOUTUBE_LIVE_VIDEOS`;
    }
    getVideos(options: GetVideosParams = {}) {
        const defaultOptions = {
            limit: 50,
            orderBy: "publishedAt,desc",
        };
        const {
            limit = 50,
            orderBy,
            maxDuration,
            minDuration,
            startAfter
        } = { ...defaultOptions, ...options };
        const collection = this.getYoutubeVideosCollection();
        let query: Query = this.dataStore.collection(collection);
        if (maxDuration) {
            query = query.where("durationInSeconds", "<", maxDuration);
            query = query.orderBy("durationInSeconds", "desc");

        }
        if (minDuration) {
            query = query.where("durationInSeconds", ">=", minDuration);
            query = query.orderBy("durationInSeconds", "desc");

        }
        if (startAfter) {
            query.startAfter(startAfter);
        }
        const [property, order] = orderBy.split(",");
        query = query.orderBy(property, order as "desc" | "asc");
        query = query.limit(limit);
        return this.dataStore.findAllDocs(query, { schema: YoutubeVideoSchema });
    }

    queryVideos(
        options: QueryVideosParams

    ) {
        const defaults = {
            searchTags: ["any"],
            orderBy: "publishedAt,desc",
            limit: 20
        };
        const { searchTags, orderBy, limit, pageNumber = 1, startDate, endDate } = { ...defaults, ...options };
        const collection = this.getYoutubeVideosCollection();
        let query: Query = this.dataStore.collection(collection);
        const [property, order] = orderBy.split(",");


        query = query.where("tags", "array-contains-any", searchTags);

        query = query.orderBy(property, order as "desc" | "asc");
        if (startDate) {
            query = query.where("publishedAt", ">=", Timestamp.fromDate(startDate));
        }
        if (endDate) {
            query = query.where("publishedAt", "<=", Timestamp.fromDate(endDate));
        }
        const startAfter = (pageNumber - 1) * limit;

        query = query.offset(startAfter).limit(limit);
        // { schema: YoutubeVideoSchema}
        // TODO: fix data parsing schma
        return this.dataStore.findAllDocs(query);
    }

    getVideoById(videoId: string) {
        const collection = this.getYoutubeVideosCollection();
        const docRef = this.dataStore.collection(collection).doc(videoId);
        return this.dataStore.getDoc(docRef.path);
    }
    getVideosWithAudio(
        {
            limit = 50,
            orderBy = "publishedAt,desc",
            maxDuration,
        }: GetVideosParams
    ) {
        const collection = this.getYoutubeVideosCollection();
        let query: Query = this.dataStore.collection(collection);
        if (maxDuration) {
            query = query.where("durationInSeconds", "<=", maxDuration);
        }
        query = query.orderBy("audioFiles");
        const [property, order] = orderBy.split(",");
        query = query.orderBy(property, order as "desc" | "asc");
        query.limit(limit);
        return this.dataStore.findAllDocs(query, { schema: YoutubeAudioSchema });
    }
    getUpcomingVideos(options: GetUpcomingVideosParams = {}) {
        const defaultOptions = {
            limit: 50,
            orderBy: "scheduledStartTime,desc",
        };
        const {
            limit,
            orderBy
        } = { ...defaultOptions, ...options };
        const collection = this.getYoutubeVideosCollection();
        let query: Query = this.dataStore.collection(collection)
            .where("liveBroadcastContent", "==", "upcoming");
        const [property, order] = orderBy.split(",");
        query = query.orderBy(property, order as "desc" | "asc");
        query = query.limit(limit);
        return this.dataStore.findAllDocs(query, { schema: YoutubeVideoSchema });
    }
    getLiveVideos() {
        const collection = this.getYoutubeLiveVideoCollection();
        let query: Query = this.dataStore.collection(collection)
            .where("lifeCycleStatus", "==", "live");
        return this.dataStore.findAllDocs(query);
    }
    async saveYoutubeVideo(
        video: YoutubeVideo,
        batch?: WriteBatch
    ) {
        return this.dataStore.createDoc({
            collection: this.getYoutubeVideosCollection(),
            data: { ...(video as any), docId: video.id },
            schema: YoutubeVideoSchema,
            batch
        });

    }
    async saveYoutubeVideos(inputVideos: NewYoutubeVideo[]) {
        const videos = inputVideos.map(v => this.parseYtVideo(v));
        const batch = this.dataStore.batch();
        videos.forEach(v => this.saveYoutubeVideo(v, batch));
        return batch.commit()
    }
    public createVideoTags(video: NewYoutubeVideo): YoutubeVideoTag[] {
        const tags: YoutubeVideoTag[] = ["any"];
        if (video.durationInSeconds <= SONG_VIDEO_MAX_DURATION) {
            tags.push("song");
        } else {
            tags.push("predication");
        }
        const validTags = Object.values(YoutubeVideoTagSchema.enum);
        validTags.forEach(tag => {
            const title = video.title.toLowerCase();
            const description = video.description.toLowerCase();
            if (title.includes(tag) || description.includes(tag)) {
                tags.push(tag);
            }
        });

        if (tags.length === 2 && tags.includes('predication')) {
            tags.push("local");
        }
        return tags;
    }
    private parseYtVideo(video: NewYoutubeVideo) {
        const tags = this.createVideoTags(video);

        return YoutubeVideoSchema.parse({
            ...video,
            tags
        });
    }

}
