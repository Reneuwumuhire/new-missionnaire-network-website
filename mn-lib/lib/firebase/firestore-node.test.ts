import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FirestoreDataSource } from "./firestore-node";
import { z } from "zod";
import { WriteResult } from "@google-cloud/firestore";

describe("Test for firestore data store that runs on server only", () => {
    let firestoreDataStore = FirestoreDataSource.getInstance();
    beforeEach(() => {
        vi.restoreAllMocks();
    })
    it("should call schema.parse with passed data", async () => {
        const newDocData = {
            name: "test",
            time: new Date()
        };
        const collectionPath = "test_collection";
        const schema = z.object({
            name: z.string(),
            time: z.date()
        });
        const zParseSpy = vi.spyOn(schema, "parse")
            .mockImplementation((d) => {
                expect(d).toBe(newDocData);
                return newDocData;
            });
        const collectionRef = firestoreDataStore.collection(collectionPath);
        const docRef = collectionRef.doc("test_doc");
        vi.spyOn(firestoreDataStore, "collection").mockImplementation(_ => collectionRef);
        vi.spyOn(collectionRef, "doc").mockImplementation(_ => docRef);
        const createDocSpy = vi.spyOn(docRef, "create")
            .mockImplementation(async (a: any) => {
                return {} as WriteResult
            });
        const res = await firestoreDataStore.createDoc(
            collectionPath,
            newDocData,
            { schema }
        );
        expect(zParseSpy).toHaveBeenCalledOnce();
        expect(createDocSpy).toHaveBeenCalledOnce();

    });
});