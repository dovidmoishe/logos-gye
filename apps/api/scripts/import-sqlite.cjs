// One-time upgrade for existing demo installations. Keep the source read-only.
const { DatabaseSync } = require("node:sqlite");
const { Database } = require("../dist/db/connection");
const { partners } = require("../dist/db/schema");
async function main() {
  const file = process.argv[2];
  if (!file) throw Error("Supply the path to the old demo.sqlite file.");
  const source = new DatabaseSync(file, { readOnly: true });
  const target = new Database();
  try {
    await target.onModuleInit();
    const rows = source
      .prepare(
        "SELECT id,workspace,email,status,expiresAt FROM partners ORDER BY rowid",
      )
      .all();
    let imported = 0;
    await target.db.transaction(async (tx) => {
      for (const row of rows) {
        if (row.status === "Pending" && row.expiresAt <= Date.now())
          row.status = "Expired";
        const inserted = await tx
          .insert(partners)
          .values(row)
          .onConflictDoNothing({ target: partners.id })
          .returning({ id: partners.id });
        imported += inserted.length;
      }
    });
    console.log(`Imported ${imported} of ${rows.length} demo agreements.`);
  } finally {
    source.close();
    await target.onApplicationShutdown();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
