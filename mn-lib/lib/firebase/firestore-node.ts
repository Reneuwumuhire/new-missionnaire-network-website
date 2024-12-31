import { DocumentReference, FieldValue, Firestore, Query, QuerySnapshot, Timestamp, WriteBatch, Transaction } from "@google-cloud/firestore";
import type { ZodType } from "zod";
import { type UserBasicInfo, UserBasicInfoSchema } from "../models/auth";
import path from "path";

const PROJECT_ID = process.env.PROJECT_ID || "missionnairenetwork";

interface ZodSchema<T> {
    parse: (_: unknown) => T
}
const defaultSettings: FirebaseFirestore.Settings = {
    keyFilename: path.resolve("./application_default_credentials.json"),
    projectId: PROJECT_ID
};
interface GetDocOptions<T> {
    schema?: ZodSchema<T>
    tx?: Transaction
}
interface CreateDocOptions<T> {
    collection: string,
    data: T,
    schema?: ZodType<T>,
    batch?: WriteBatch,
    tx?: Transaction
}
interface UpdateDocOptions<T> {
    docPath: string,
    data: T,
    schema?: ZodType<T>,
    tx?: Transaction
}
type FirestoreDocDataValue = string | number | Date | Array<string | number | Date | Timestamp>
type FirestoreDocData = Record<
    string, FirestoreDocDataValue
    | Record<string, FirestoreDocDataValue>
    | Array<FirestoreDocDataValue>
>;
type DataStoreContext = {
    user?: UserBasicInfo
}
type DataStoreArgs = {
    settings?: FirebaseFirestore.Settings,
    context?: DataStoreContext
}
export const firestoreDB = new Firestore(defaultSettings);
export class FirestoreDataSource extends Firestore {
    static instance: FirestoreDataSource | undefined;
    constructor(
        settings?: FirebaseFirestore.Settings,
        public readonly context: DataStoreContext = {}
    ) {
        super(settings);
    }
    public static getInstance({
        settings = defaultSettings,
        context
    }: DataStoreArgs = {}): FirestoreDataSource {
        if (FirestoreDataSource.instance) return FirestoreDataSource.instance;
        return new FirestoreDataSource(settings, context);
    }
    async getDoc<T>(
        docPath: string,
        options: GetDocOptions<T> = {}
    ): Promise<T | null> {
        const { schema, tx } = options;
        const docRef = this.doc(docPath);
        const doc = !!tx ? await tx.get(docRef) : await docRef.get();
        if (!doc.exists) return null;
        const docData = doc.data() as Record<string, any>;
        if (schema) {


            return schema.parse({
                ...docData,
                docId: doc.id,
                docPath: doc.ref.path
            } as any);
        }
        return {
            ...docData,
            docId: doc.id,
            docPath: doc.ref.path
        } as any;
    }
    async findAllDocs<D>(
        query: string | Query,
        options: GetDocOptions<D> = {}
    ): Promise<D[]> {
        const { schema, tx } = options;
        let querySnap: QuerySnapshot;
        if (query instanceof Query) {
            querySnap = !!tx ? await tx.get(query) : await query.get();
        } else {
            const q = this.collection(query);
            querySnap = !!tx ? await tx.get(q) : await q.get();
        }
        const snapshotData = querySnap.docs.map(doc => {
            const data = doc.data();
            for (const k in data) {
                const v = data[k];
                if (!(v instanceof Timestamp)) {
                    continue;
                }
                data[k] = v.toDate();
            }
            return {
                ...data,
                // creationTime: (data.creationTime as unknown as Timestamp).toDate(),
                // lastUpdate: (data.lastUpdate as unknown as Timestamp).toDate(),
                docId: doc.id,
                docPath: doc.ref.path
            }
        });
        if (!schema) {
            return snapshotData as any[];
        }
        return schema.array().parse(snapshotData);
    }
    updateDoc<D>({ docPath, data, schema, tx }: UpdateDocOptions<D>) {

        const docRef = this.doc(docPath);
        const createdBy = {};
        const updatedBy = {};
        const docDefaults = {
            creationTime: FieldValue.serverTimestamp(),
            lastUpdate: FieldValue.serverTimestamp(),
            createdBy,
            updatedBy
        };
        if (!schema) {
            return !!tx ? tx.update(docRef, { ...data, ...docDefaults }) : docRef.update({ ...data, ...docDefaults });
        }
        const parsedDocData = schema.parse(data);
        return docRef.update({ ...parsedDocData, ...docDefaults });
    }
    deleteDoc(docPath: string, { tx }: { tx?: Transaction }) {
        const docRef = this.doc(docPath);
        return !!tx ? tx.delete(docRef) : docRef.delete();
    }
    createDoc<D extends FirestoreDocData>({ collection, data, schema, batch, tx }: CreateDocOptions<D>) {

        const createdBy = this.context.user ? UserBasicInfoSchema.parse(this.context.user) : {};
        const updatedBy = createdBy;
        const docDefaults = {
            creationTime: FieldValue.serverTimestamp(),
            lastUpdate: FieldValue.serverTimestamp(),
            createdBy,
            updatedBy
        };

        const parsedDocData = schema ? schema.parse(data) : data;
        let docRef: DocumentReference;
        if (data.docId) {
            docRef = this.collection(collection).doc(data.docId as string);
            delete data.docId;
        } else {
            docRef = this.collection(collection).doc()
        }
        const docData = {
            ...parsedDocData,
            ...docDefaults
        };
        if (tx) {
            return tx.create(docRef, docData);
        } else if (batch) {
            return batch.create(docRef, docData);
        }
        return docRef.create(docData);


    }
}
