import { AccountCredentialsDocSchema, AccountCredentialsSchema, type UserBasicInfo } from "../models/auth";
import type { OAuth2Client } from "google-auth-library";
import { FirestoreDataSource } from "../firebase/firestore-node";
import { google, youtube_v3 } from "googleapis";
import { Result } from "@badrap/result";
import { NewYoutubeVideoSchema, YoutubeVideoSchema } from "../models/youtube";


type OauthClient = {
    clientId: string,
    clientSecret: string,
    redirectUri: string
}

type YTRepoParams = {
    user: UserBasicInfo,
    oauthClient: OauthClient
    channelId: string
}

export class YTRepository {
    private readonly youtubeBaseEndpoint = "https://www.googleapis.com/upload/youtube/v3";
    private readonly youtubeApi: youtube_v3.Youtube
    constructor(
        private readonly user: UserBasicInfo,
        private readonly oAuth2Client: OAuth2Client,
        private readonly firestore: FirestoreDataSource
    ) {
        this.youtubeApi = google.youtube({
            version: "v3",
            auth: oAuth2Client
        });
    }
    public static async createInstance({
        user,
        oauthClient,
        channelId
    }: YTRepoParams) {
        const { clientId, clientSecret, redirectUri } = oauthClient;
        const firestore = FirestoreDataSource.getInstance({
            context: { user }
        });
        const query = firestore.collection('user_sessions')
            .where('createdBy.id', '==', user.id)
            .where('status', '==', 'valid')
            .where('scope', 'array-contains', "https://www.googleapis.com/auth/youtube")
            .orderBy('lastUpdate', 'desc');
        const docs = await firestore.findAllDocs(query);

        const credentialsDoc = docs[0];

        const credentials = AccountCredentialsSchema.parse(credentialsDoc);
        const oauth2Client = new google.auth.OAuth2({
            clientId,
            clientSecret,
            redirectUri
        });
        oauth2Client.setCredentials({
            ...credentials,
            scope: (credentials.scope ?? []).join(' ')
        });

        return new YTRepository(
            user!,
            oauth2Client,
            firestore
        );
    }
    async getChannels() {
        try {
            const channelsResult = await this.youtubeApi.channels.list({
                mine: true,
                part: ["snippet"]
            });
            if (channelsResult.status !== 200) {
                return Result.err(new Error(channelsResult.statusText));
            }
            return Result.ok(channelsResult.data)
        } catch (error) {
            return error instanceof Error ? Result.err(error) : Result.err(new Error(`${error}`));
        }
    }
    async saveUserChannels() {
    }
    async createLiveBroadcast({
        title,
        description,
        thumbnailFile,
        scheduledAt,
        channelId,
        privacyStatus = "public"
    }: {
        title: string,
        description: string,
        scheduledAt: string,
        thumbnailFile: File,
        channelId: string
        privacyStatus: "public" | "private" | "unlisted"
    }) {
        const requestParams = {
            part: ["snippet", "status"],
            requestBody: {
                snippet: {
                    channelId,
                    description,
                    title,
                    scheduledStartTime: scheduledAt,
                },
                status: {
                    selfDeclaredMadeForKids: false,
                    privacyStatus
                }
            }
        };
        const res = await this.youtubeApi.liveBroadcasts.insert(requestParams);
        if (res.status !== 200) {
            return Result.err(new Error(res.statusText));
        }
        const data = res.data;

        const videoId = data.id;
        if (!videoId) {
            return Result.err(new Error(`videoId is ${videoId}`));
        }
        const thumbnailResult = await this.updateVideoThumbnail(videoId, thumbnailFile);
        if (thumbnailResult.isErr) {
            return Result.err(thumbnailResult.error);
        }
        return Result.ok(true);;
    }
    async updateVideoThumbnail(videoId: string, thumbnailFile: File) {
        const token = this.oAuth2Client.credentials.access_token;
        const thumbnailApiPathname = "/thumbnails/set";
        const endpoint = new URL(this.youtubeBaseEndpoint + thumbnailApiPathname);
        endpoint.searchParams.set("videoId", videoId);
        endpoint.searchParams.set("uploadType", "media");
        try {
            const fetchResult = await fetch(
                endpoint.href,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": thumbnailFile.type,
                    },
                    body: thumbnailFile
                }
            );
            if (fetchResult.status !== 200) {
                return Result.err(new Error(fetchResult.statusText));
            }
            return Result.ok(await fetchResult.json());
        } catch (error) {
            if (error instanceof Error) {
                return Result.err(error);
            }
            return Result.err(new Error(`${error}`));
        }
    }
    async getUpcoming() {
        const res = await this.youtubeApi.liveBroadcasts.list({
            mine: true,
            part: ["snippet", "status", "contentDetails"],
        });
        if (res.status !== 200) return Result.err(new Error(res.statusText));
        const items = res.data.items?.filter(d => {

            return (
                d.status?.lifeCycleStatus === "ready"
                || d.status?.lifeCycleStatus === "created"
                || d.status?.lifeCycleStatus === "live"
            );
        });
        const data = { ...res.data, items };


        return Result.ok(data);
    }
    async getVideoDetails(videoId: string) {
        const res = await this.youtubeApi.videos.list({
            part: ["snippet", "status", "contentDetails", "recordingDetails", "liveStreamingDetails"],
            id: [videoId]
        });
        if (res.status !== 200) {
            return Result.err(new Error(res.statusText));
        }
        return Result.ok(res.data);
    }
    createApiEndpoint(
        pathname: string,
        part: string[],
        query: Record<string, string | number>
    ): string {
        const endpoint = new URL("https://www.googleapis.com/youtube/v3" + pathname);

        const p = part.map(p => `part=${p}`).join("&");

        for (const key in query) {
            endpoint.searchParams.set(key, query[key].toString());
        }
        let [a, b] = endpoint.href.split("?");

        return [a, p + "&" + b].join("?");
    }
    async fetch(endpoint: string) {

        const token = this.oAuth2Client.credentials.access_token;
        const headers = {
            Authorization: `Bearer ${token}`,
            'x-goog-api-client': 'gdcl/7.0.1 gl-node/18.14.0',
            'Accept-Encoding': 'gzip',
            'User-Agent': 'google-api-nodejs-client/7.0.1 (gzip)'
        }
        try {
            const fetchResult = await fetch(
                endpoint,
                {
                    method: "GET",
                    headers

                }
            );

            if (fetchResult.status !== 200) {
                return Result.err(new Error(fetchResult.statusText));
            }
            return Result.ok(await fetchResult.json());
        } catch (error) {
            if (error instanceof Error) {
                return Result.err(error);
            }
            return Result.err(new Error(`${error}`));
        }
    }
    async getChannelVideos(channelId: string, pageToken?: string) {

        const videosIdsRes = await this.youtubeApi.search.list({
            part: ["id"],
            channelId,
            order: "date",
            maxResults: 50,
            pageToken
        });
        const videoIds = videosIdsRes.data.items!.map(v => v.id!.videoId) as string[];


        const res = await this.youtubeApi.videos.list({
            part: ["snippet", "status", "contentDetails", "recordingDetails", "liveStreamingDetails"],
            id: videoIds
        });

        if (res.status !== 200) {
            return Result.err(new Error(res.statusText));
        }
        const nextPageToken = videosIdsRes.data.nextPageToken;
        const videoItems = res.data.items!.map(v => {
            const durationString = v.contentDetails?.duration ?? "";
            const durationInSeconds = this.durationInSeconds(durationString);

            return {
                ...v,
                ...v.status,
                ...v.recordingDetails,
                ...v.contentDetails,
                ...v.snippet,
                ...v.liveStreamingDetails,
                durationInSeconds
            }
        });
        const videos = NewYoutubeVideoSchema.array().parse(videoItems);
        return Result.ok({
            videos,
            nextPageToken
        });
    }
    durationInSeconds(duration: string) {
        if (duration == "") return 0;

        let [hPart, restMinutesAndSeconds] = duration.slice(2).split("H");
        if (restMinutesAndSeconds === undefined) {
            restMinutesAndSeconds = hPart;
            hPart = "0";
        }
        let [mPart, restSeconds] = restMinutesAndSeconds.split("M");
        if (restSeconds === undefined) {
            restSeconds = mPart;
            mPart = "0";
        }

        let [sPart, rest] = restSeconds.split("S");
        if (rest === undefined) {
            sPart = "0";
        }
        const hToSec = Number(hPart) * 60 * 60;
        const mToSec = Number(mPart) * 60;
        const seconds = hToSec + mToSec + Number(sPart);
        return seconds;
    }
}
