import minimist from "minimist";
import chalk from "chalk";
import gcloud from "@google-cloud/firestore";


const YOUTUBE_CHANNELS_COLLECTION = "YOUTUBE_CHANNELS";

const gcCredentials = process.env.GC_DEFAULT_CREDENTIALS;
const projectId = process.env.GC_PROJECT_ID;

const YOUTUBE_DATA_API = "https://youtube.googleapis.com/youtube/v3/search";


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
    return {
        ...docSnap.data(),
        channelId: docRef.id
    }
}


/**
 * 
 * @param {string} channelId 
 * @param {string} apiKey 
 * @param {number} page 
 * @returns {Promise<YoutubeSearchResult>}
 *
 */
const fetchVideosFromYT = async (channelId, apiKey, page) => {
    const apiURL = new URL(YOUTUBE_DATA_API);
    apiURL.searchParams.set("part", "snippet");
    apiURL.searchParams.set("channelId", channelId);
    apiURL.searchParams.set("key", apiKey);
    apiURL.searchParams.set("order", "date");
    apiURL.searchParams.set("type", "video");
    // apiURL.searchParams.set("videoDuration", videoDuration);
    apiURL.searchParams.set("maxResults", page.toString());

}

(async function(){
    if(!gcCredentials){
        console.log("%s", chalk.red("Google cloud default credentials not found in the current environment" ));
        process.exit();
    } 
    if(!projectId){
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
        const youtubeResult = await fetchVideosFromYT(channelId, apiKey, page);
        

    } catch (error) {
        
    }

    
    
    
    process.exit();

})();


