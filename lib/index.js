import minimist from "minimist";
import chalk from "chalk";
import gcloud from "@google-cloud/firestore";
import fetch from "node-fetch";


const YOUTUBE_CHANNELS_COLLECTION = "YOUTUBE_CHANNELS";
const YOUTUBE_CHANNEL_VIDEOS_COLLECTION = "YOUTUBE_VIDEOS";

const gcCredentials = process.env.GC_DEFAULT_CREDENTIALS;
const projectId = process.env.GC_PROJECT_ID;

const YOUTUBE_DATA_API = "https://youtube.googleapis.com/youtube/v3/search";

/** @param {string} */
const logInfo = (message) => {
    console.log(`%s ${message}`, chalk.yellow("INFO"));
}

/** @param {string} */
const logError = (message) => {
    console.log(`%s ${message}`, chalk.bgRed("INFO"));
}


/**
 * @returns {Args}
 */
const getArgs = () => {
    const errorMessages = [];
    const {channelId, apiKey,  page=50} = minimist(process.argv.slice(2));
    if(!channelId) {
        errorMessages.push("channelId");
    }
    if(!apiKey) {
        errorMessages.push("apiKey");
    }
    if(errorMessages.length !==0){
        console.log("%s", chalk.bgRed("Required args: "),  ...errorMessages.map(m=>chalk.red(m)));
        process.exit();
    }
    return {
        channelId,
        apiKey,
        page
    }

}


const DB = new gcloud.Firestore({
    projectId,
    keyFilename: gcCredentials
});

/** 
 * @param {string} channelId 
 * @returns {Promise<ChannelSyncInfo | null>}
*/
const getChannelInfo = async (channelId) => {
    const docRef = DB.collection(YOUTUBE_CHANNELS_COLLECTION).doc(channelId);
    const docSnap = await docRef.get();
    if(!docSnap.exists) return null;
    const totalSyncedVideos =  0;
    const currentPageToken = null;
    return {
        totalSyncedVideos,
        currentPageToken,
        ...docSnap.data(),
        channelId: docRef.id
    }
}

/**
 * 
 * @param {any} youtubeResult 
 * @returns {YoutubeVideo[]}
 */
const parseYTResponse = (youtubeResult) => {
    if(!youtubeResult.items || youtubeResult.items.length < 1){
        return []
    }

    const videos = youtubeResult.items.map(v => {
        const snippet = v.snippet;
        /** @type {YoutubeVideo} */
        const video = {
            ...snippet,
            videoId: v.id.videoId,
            publishedAt: new Date(snippet.publishedAt),
            publishTime: new Date(snippet.publishTime),
        }
        return video
    });
    return videos

}
/**
 * 
 * @param {string} channelId 
 * @param {string} apiKey 
 * @param {number} page
 * @param {string?} pageToken
 * @returns {Promise<YoutubeSearchResult>}
 *
 */
const fetchVideosFromYT = async (channelId, apiKey, page, pageToken) => {
    const apiURL = new URL(YOUTUBE_DATA_API);
    apiURL.searchParams.set("part", "snippet");
    apiURL.searchParams.set("channelId", channelId);
    apiURL.searchParams.set("key", apiKey);
    apiURL.searchParams.set("order", "date");
    apiURL.searchParams.set("type", "video");
    apiURL.searchParams.set("maxResults", page.toString());
    pageToken && apiURL.searchParams.set("pageToken",  pageToken);
    const fetchResult = await fetch(apiURL.toString());
    if(!fetchResult.ok){
        console.log(" %s ", chalk.bgRed("ERROR"), chalk.red("Error fetching youtube data"));
        console.log(await fetchResult.json());
        process.exit();
    }
    const jsonResult = await fetchResult.json();
    const videos = parseYTResponse(jsonResult);
    return {
        nextPageToken: jsonResult?.nextPageToken ?? null,
        prevPageToken: jsonResult?.prevPageToken ?? null,
        totalResults: jsonResult.pageInfo.totalResults,
        resultsPerPage: jsonResult.pageInfo.resultsPerPage,
        videos
    }

}
/**
 * @param {ChannelSyncInfo} channelInfo
 * @param {YoutubeSearchResult} youtubeResult
 * @returns {Promise<void>}
 */
const saveVideosToDB = async (channelInfo,  youtubeResult) => {
    const {channelId} = channelInfo;
    const batch = DB.batch();
    const {nextPageToken = null, prevPageToken = null, totalResults, resultsPerPage, currentPageToken = null } = youtubeResult;
    const channelVideosStats = {
        nextPageToken,
        currentPageToken,
        prevPageToken,
        totalResults,
        resultsPerPage,
    };

    const channelDocRef = DB.doc(`${YOUTUBE_CHANNELS_COLLECTION}/${channelId}`);
    const channelVideosCollectionRef = channelDocRef.collection(YOUTUBE_CHANNEL_VIDEOS_COLLECTION);

    batch.update(
        channelDocRef,
        {
            ...channelInfo,
            ...channelVideosStats,
            totalSyncedVideos: channelInfo.totalSyncedVideos + resultsPerPage
        }
        
    );
    youtubeResult.videos.forEach(video => {
        const { channelTitle, channelId, ...videoData } = video;
        const videoDocRef = channelVideosCollectionRef.doc(videoData.videoId);
        batch.set(videoDocRef, videoData);
    });
    await batch.commit();

}

/**
 * @param {ChannelSyncInfo} channelInfo
 * @param {string} apiKey
 * @param {number} page
 * @param {string?} pageToken
 */
const synchAllVideos = async (channelInfo, apiKey, page, pageToken) => {
    const {channelId} = channelInfo;
    logInfo("Youtube videos sync started.");
        logInfo("%s Downloading videos info from Youtube.");
        const youtubeResult = await fetchVideosFromYT(channelId, apiKey, page, pageToken);
        const totalSyncedVideos = channelInfo.totalSyncedVideos + youtubeResult.resultsPerPage;

    console.log(`%s`, chalk.yellow("INFO"), chalk.cyan(`${totalSyncedVideos} of ${youtubeResult.totalResults} videos Downloaded.`));
    logInfo("%s Saving videos info to youtube");
    await saveVideosToDB(channelInfo, youtubeResult);
    if (youtubeResult.nextPageToken) {
        await synchAllVideos({
            ...channelInfo,
            currentPageToken: pageToken ?? null,
            totalSyncedVideos
        }, apiKey, page, youtubeResult.nextPageToken);
    }
}
(async function () {
    if (!gcCredentials) {
        console.log("%s", chalk.red("Google cloud default credentials not found in the current environment"));
        process.exit();
    }
    if (!projectId) {
        console.log("%s", chalk.red("Google cloud project not found in the current environment"));
        process.exit();
    } 
    

    const args = getArgs();
    const { channelId, apiKey, page } = args;

    const channelInfo = await getChannelInfo(channelId);
    if(!channelInfo){
        console.log("%s", chalk.bgRed("ERROR"), chalk.red("channel not found"));
        process.exit();
    }
    
    try {
        
        await synchAllVideos(channelInfo,apiKey, page, channelInfo.nextPageToken);
        

        console.log("%s YT videos synced successfully!", chalk.bgGreen("SUCCESS"));


    } catch (error) {
        console.log("%s", chalk.bgRed("ERROR"),  chalk.red(error));
        console.error(error);

        
    }

    
    
    
    process.exit();

})();


