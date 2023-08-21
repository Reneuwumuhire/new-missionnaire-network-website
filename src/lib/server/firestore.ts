import Firestore from "@google-cloud/firestore";

// TODO: remove the passed object in prod environment
export const db = new Firestore.Firestore();