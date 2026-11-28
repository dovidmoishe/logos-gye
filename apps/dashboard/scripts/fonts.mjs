import { access, mkdir, writeFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const directory = new URL("../public/brand/", import.meta.url);
const font = new URL("Satoshi-Regular.woff2", directory);
try {
  await access(font);
} catch {
  await mkdir(directory, { recursive: true });
  const response = await fetch(
    "https://api.fontshare.com/v2/css?f[]=satoshi@400&display=swap",
    { signal: AbortSignal.timeout(20000) },
  );
  if (!response.ok) throw Error("Fontshare stylesheet unavailable");
  const source = (await response.text()).match(
    /url\(['"]?(?:https:)?(\/\/cdn\.fontshare\.com\/[^'")]+\.woff2)/,
  )?.[1];
  if (!source) throw Error("Satoshi web font missing from stylesheet");
  const download = await fetch("https:" + source, {
    signal: AbortSignal.timeout(30000),
  });
  const bytes = Buffer.from(await download.arrayBuffer());
  if (!download.ok || bytes.toString("ascii", 0, 4) !== "wOF2")
    throw Error("Invalid Satoshi font download");
  const temporary = new URL(randomUUID() + ".tmp", directory);
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, font);
  } finally {
    await rm(temporary, { force: true });
  }
}
