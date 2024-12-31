import { Result } from "@badrap/result";
import jwt from "jsonwebtoken";
import { google } from "googleapis";
import type { OAuth2Client, Credentials } from "google-auth-library";
import { FirestoreDataSource } from "../firebase/firestore-node";
import {
    NewUserSessionSchema,
    type User,
    type UserBasicInfo,
    UserBasicInfoSchema,
    UserSchema,
    type UserSession,
    UserSessionSchema,
    ChannelAccountSchema,
    type ChannelAccount,
    ChannelAccountDocSchema,
    AccountCredentialsSchema,
    type ChannelAccountDoc,
    NewUserSchema,
    type UserInfo
} from "../models/auth";
import { JWT_SECRET_KEY } from "$env/static/private";

interface GoogleAccountOauth2 {
    redirectUrl: string,
    clientId: string,
    secret: string
}

interface Oauth2Params extends GoogleAccountOauth2 {
    scope: string[],

}
const HTTP_STATUS = {
    OK: 200
} as const;

export function createOauth2Url({ scope, redirectUrl, clientId, secret }: Oauth2Params): string {

    const oauth2Client = new google.auth.OAuth2(clientId, secret, redirectUrl);

    const oauth2Url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope
    });
    return oauth2Url;
}
export function createGoogleAccountOauthUrl(options: GoogleAccountOauth2): string {
    const scope = [
        "https://www.googleapis.com/auth/userinfo.profile"
    ];
    return createOauth2Url({ ...options, scope });
}
export function createYoutubeAccountOauthUrl(options: GoogleAccountOauth2): string {
    const scope = [
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/youtube",
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtubepartner"
    ];
    return createOauth2Url({ ...options, scope });
}
export async function getOauth2Credentials(
    tokenCode: string,
    oauth2Client: OAuth2Client
): Promise<Result<Credentials, Error>> {
    const token = await oauth2Client.getToken(tokenCode);
    if (!token.res) {
        return Result.err(new Error("no result found"));
    } else {
        if (token.res.status !== HTTP_STATUS.OK) {
            return Result.err(new Error(token.res.statusText));
        }
    }
    return Result.ok(token.tokens);
}

export async function getOauth2UserInfo(oauth2Client: OAuth2Client) {
    try {
        const googleAuth = google.oauth2({
            version: "v2",
            auth: oauth2Client
        });
        const userInfo = await googleAuth.userinfo.get();
        return Result.ok(userInfo.data);
    } catch (e) {
        return e instanceof Error ? Result.err(e) : Result.err(new Error("that's an error"));
    }
}


export async function createIfNotExistsUser(
    dataSource: FirestoreDataSource,
    userInfo: UserBasicInfo
): Promise<Result<User, Error>> {

    const userPath = `users/${userInfo.id}`;
    const existingUser = await dataSource.getDoc(userPath, { schema: UserSchema });

    if (existingUser == null) {
        const data = {
            ...(userInfo as any),
            docId: userInfo.id,
            status: "inactive"
        }
        await dataSource.createDoc({ collection: "users", data });
        return Result.err(new Error("unknown user"));
    }
    if (existingUser.status != "active") {
        return Result.err(new Error(`user status is ${existingUser.status}`));
    }
    return Result.ok(existingUser);
}
export async function saveUserSession(
    dataSource: FirestoreDataSource,
    credentials: Credentials,
) {
    const userSessionCollection = "user_sessions";
    const userSessionDocRef = dataSource.collection(userSessionCollection).doc();

    const data = {
        ...(credentials as any),
        docId: userSessionDocRef.id,
        status: "valid",
    };
    try {
        await dataSource.createDoc({
            collection: userSessionCollection,
            data,
            schema: NewUserSessionSchema
        });
        return Result.ok({ sessionId: userSessionDocRef.id });
    } catch (error) {
        if (error instanceof Error) return Result.err(error);
        return Result.err(new Error(`${error}`));
    }

}
export async function getUserSession(sessionId: string): Promise<Result<UserSession>> {
    const firestore = FirestoreDataSource.getInstance();
    const docId = `user_sessions/${sessionId}`;
    const session = await firestore.getDoc(docId, { schema: UserSessionSchema });
    if (session == null) {
        return Result.err(new Error("session not found"));
    }
    return Result.ok(session);
}
export async function getUserById(userId: string): Promise<Result<User>> {
    const firestore = FirestoreDataSource.getInstance();
    const userDocPath = `users/${userId}`;
    const user = await firestore.getDoc(userDocPath, { schema: UserSchema });
    if (!user) return Result.err(new Error("user not found"));
    return Result.ok(user);


}
export async function verifyUserSession(sessionToken: string): Promise<Result<UserInfo>> {

    try {
        const claims = jwt.verify(sessionToken, JWT_SECRET_KEY);
        const userInfo = NewUserSchema.parse(claims)

        return Result.ok(userInfo);

    } catch (err) {

        console.log(err);

        return Result.err(new Error('error...'));
    }



}
export async function saveChannelCredentials(
    channel: ChannelAccount,
    credentials: Credentials,
    user: UserBasicInfo
) {
    const existingChannelResult = await getOrInsertChannel(channel, user);
    if (existingChannelResult.isErr) {
        return Result.err(existingChannelResult.error);
    }
    const existingChannel = existingChannelResult.value;
    return saveYtCredentials(existingChannel.id, credentials, user);
}
export async function saveYtCredentials(
    channelId: string,
    credentials: Credentials,
    user: UserBasicInfo
) {
    const firestore = FirestoreDataSource.getInstance({
        context: { user }
    });
    const collection = `users/${user.id}/channels_accounts/${channelId}/credentials`;
    try {
        await firestore.createDoc({
            collection,
            data: {
                ...(credentials as any),
                docId: "default"
            },
            schema: AccountCredentialsSchema
        });
        return Result.ok(true);
    } catch (error) {
        return error instanceof Error ? Result.err(error) : Result.err(new Error(`${error}`))
    }
}
export async function getOrInsertChannel(channel: ChannelAccount, user: UserBasicInfo) {
    const existingChannelResult = await getChannelById(channel.id, user.id);
    if (existingChannelResult.isErr) {
        return Result.err(existingChannelResult.error);
    }
    const existingChannel = existingChannelResult.value;
    if (existingChannel === null) {
        const res = await insertYtChannelAccount(channel, user);
        if (res.isErr) {
            return Result.err(res.error);
        }
        return Result.ok(channel);
    }
    return Result.ok(existingChannel);

}
export async function insertYtChannelAccount(channel: ChannelAccount, user: UserBasicInfo) {

    const firestore = FirestoreDataSource.getInstance({
        context: { user }
    });
    const collection = `users/${user.id}/channels_accounts`;
    try {
        const data = { ...channel, default: true, docId: channel.id } as any;

        await firestore.createDoc({
            collection,
            data,
            schema: ChannelAccountSchema
        });
        return Result.ok(channel);
    } catch (error) {
        return error instanceof Error ? Result.err(error) : Result.err(new Error(`${error}`))
    }


}
export async function getChannelById(channelId: string, userId: string) {
    const firestore = FirestoreDataSource.getInstance();
    const docPath = `users/${userId}/channels_accounts/${channelId}`;
    const channel = await firestore.getDoc(docPath, { schema: ChannelAccountDocSchema });
    return Result.ok(channel);
}

export async function addUserChannel(
    userId: string,
    tokenCode: string,
    options: GoogleAccountOauth2
) {
    const userResult = await getUserById(userId);
    if (userResult.isErr) return Result.err(userResult.error);
    const user = userResult.value;
    if (user.status !== "active") {
        return Result.err(new Error(`user is ${user.status}`));
    }

    const { clientId, secret: clientSecret, redirectUrl: redirectUri } = options;
    const oauth2Client = new google.auth.OAuth2({
        clientId,
        clientSecret,
        redirectUri
    });
    const credentialsResult = await getOauth2Credentials(tokenCode, oauth2Client);
    if (credentialsResult.isErr) {
        return Result.err(credentialsResult.error);
    }
    const credentials = credentialsResult.value;
    oauth2Client.setCredentials(credentials);
    const userInfoResult = await getOauth2UserInfo(oauth2Client);
    if (userInfoResult.isErr) {
        return Result.err(userInfoResult.error);
    }
    const channel = ChannelAccountSchema.parse({
        ...userInfoResult.value,
        default: false,
    });


    const res = await saveChannelCredentials(
        channel,
        credentials,
        user
    );
    if (res.isErr) {
        return Result.err(res.error);
    }

    return Result.ok(channel);

}

export async function createUserSession(
    tokenCode: string,
    options: GoogleAccountOauth2
): Promise<Result<{ sessionId: string, token: string }, Error>> {
    const { clientId, secret: clientSecret, redirectUrl: redirectUri } = options;
    const oauth2Client = new google.auth.OAuth2({
        clientId,
        clientSecret,
        redirectUri
    });
    const credentialsResult = await getOauth2Credentials(tokenCode, oauth2Client);
    if (credentialsResult.isErr) {
        return Result.err(credentialsResult.error);
    }
    const credentials = credentialsResult.value;
    oauth2Client.setCredentials(credentials);
    const userInfoResult = await getOauth2UserInfo(oauth2Client);

    if (userInfoResult.isErr) {
        return Result.err(userInfoResult.error);
    }
    const userInfo = UserBasicInfoSchema.parse(userInfoResult.value);
    const dataStoreContext = { user: userInfo };
    const firestore = FirestoreDataSource.getInstance({ context: dataStoreContext });
    console.log('here we start');
    const userResult = await createIfNotExistsUser(firestore, userInfo);
    if (userResult.isErr) {
        return Result.err(userResult.error);
    }
    const userSessionIdResult = await saveUserSession(firestore, credentials);

    if (userSessionIdResult.isErr) {
        return Result.err(userSessionIdResult.error);
    }
    const iat = Date.now();
    const exp = iat + (60 * 60);

    const userClaims = {
        ...userInfo,
        sub: userInfo.id,
        status: 'active',
        iat,
        exp
    };

    const token = jwt.sign(userClaims, JWT_SECRET_KEY);

    const { sessionId } = userSessionIdResult.value;
    return Result.ok({ sessionId, token });
}
export async function getUserChannels(userId: string): Promise<ChannelAccountDoc[]> {
    const userChannelsPath = `/users/${userId}/channels_accounts`;
    const firestore = FirestoreDataSource.getInstance();
    const channels = await firestore.findAllDocs(userChannelsPath, { schema: ChannelAccountDocSchema });
    return channels;
}
