type Args = {
    channelId: string,
    apiKey: string,
    page: number,
}
type ChannelSyncInfo = {
    channelId: string,
    currentPage: string,
    prevPage: string,
    nextPage: string,
    totalVideos: number
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

type YoutubeSearchResult = {
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