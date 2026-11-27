import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: ["./src/db/schema.ts", "./src/db/scripture.ts"],
  out: "./drizzle",
  dialect: "postgresql",
});
