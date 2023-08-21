type Args = {
    channelId: string,
    apiKey: string,
    page: number,
}
type ChannelSyncInfo = {
    name: string,
    channelId: string,
    currentPageToken?: string,
    prevPageToken?: string,
    nextPageToken?: string,
    totalResults: number,
    resultsPerPage: number,
    totalSyncedVideos: number,
}
type ThumbnailInfo = {
    url: string,
    width: number,
    height: number
}

type Thumbnails = {
    default: ThumbnailInfo
    medium: ThumbnailInfo,
    high: ThumbnailInfo
}

type YoutubeVideo = {
    videoId: string,
    publishedAt: Date,
    channelId: string,
    title: string,
    description: string,
    thumbnails: Thumbnails,
    channelTitle: string,
    liveBroadcastContent: "upcoming" | "live" | "none"
    publishTime: Date,
    nextPageToken?: string,
    prevPageToken?: string,
    
}
type YoutubeSearchResult = {
    nextPageToken?: string,
    prevPageToken?: string,
    totalResults: number,
    resultsPerPage: number,
    videos: YoutubeVideo[]
}