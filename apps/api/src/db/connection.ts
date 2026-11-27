import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { Pool } from "pg";

export const localUrl =
  "postgresql://logos:logos_local@127.0.0.1:5433/logos_gye";

@Injectable()
export class Database implements OnModuleInit, OnApplicationShutdown {
  readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL || localUrl,
  });
  readonly db = drizzle(this.pool);

  async onModuleInit() {
    const client = await this.pool.connect();
    try {
      // Serialize startup migrations across API instances on this database.
      await client.query("select pg_advisory_lock(42791260)");
      await migrate(drizzle(client), {
        migrationsFolder: resolve(__dirname, "../../drizzle"),
      });
    } finally {
      try {
        await client.query("select pg_advisory_unlock(42791260)");
      } finally {
        client.release();
      }
    }
  }
  async onApplicationShutdown() {
    await this.pool.end();
  }
}
