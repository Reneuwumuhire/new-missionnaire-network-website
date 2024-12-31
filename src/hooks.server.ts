import { connect } from './db/mongo';

connect().then(async () => {
    console.log("MongoDB started");
}).catch((e) => {
    console.log("MongoDB failed to start");
    console.log(e);
});