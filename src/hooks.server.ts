import { connect } from "./db/mongo";

connect().then((result) => {
    console.log("MongoDB started");
    return result;
}).catch((e) => {
    console.log("MongoDB failed to start");
    console.log(e);
});