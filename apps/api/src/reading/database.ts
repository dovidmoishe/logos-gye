import { Database } from "../db/connection";
export const DATABASE = Symbol("ReadingDatabase");
export type AppDatabase = Database["db"];
export type ReadingTransaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];
