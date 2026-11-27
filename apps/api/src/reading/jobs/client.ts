import { Database } from "../../db/connection";
export function createDbClient() {
  const database = new Database();
  return { db: database.db, close: () => database.pool.end() };
}
