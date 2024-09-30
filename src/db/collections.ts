import { getDB } from "./mongo";

const db = getDB();

export async function getCollection(collection_name:string, skip:number, limit:number): Promise<any>
{
    // get repositories from MongoDB with skip and limit
    const data = await db.collection(collection_name).find({}).skip(skip).limit(limit).toArray();

    // return JSON response
    return data;
}

export async function searchCollection(collection_name:string, search:string): Promise<any>
{
    // get repositories from MongoDB with search query and regex options
    const data = await db.collection(collection_name).find({title:{$regex:search, $options:'i'}}).toArray();

    // return JSON response
    return data;
}