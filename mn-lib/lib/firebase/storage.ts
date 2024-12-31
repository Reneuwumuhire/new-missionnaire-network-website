import {Storage} from "@google-cloud/storage";
import path from "path";
import FirebaseFirestore from "@google-cloud/firestore";

const  NODE_ENV = process.env.NODE_ENV;

const defaultSettings: FirebaseFirestore.Settings | undefined = NODE_ENV == "development" ? {
    keyFilename: path.resolve("./application_default_credentials.json")
} : undefined;

export class FirebaseStorage {
    constructor(private readonly storage: Storage = new Storage(defaultSettings)){}


    async uploadFile(file: File){
        const bucketName = "missionnaire-website";
        const bucket = this.storage.bucket(bucketName);
        const destFileName = `audios/default/${file.name}`;
        const buffer = Buffer.from(await file.arrayBuffer())
        const asset = bucket.file(destFileName);
        asset.save(buffer);
        return asset.publicUrl()
    }
}