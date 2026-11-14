import { createRequire } from "node:module";
import { mkdir, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
const require = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const dist = join(dirname(require.resolve("maplibre-gl/package.json")), "dist");
const destination = new URL(
  "../apps/web/public/vendor/maplibre/",
  import.meta.url,
);
await mkdir(destination, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(join(dist, file), new URL(file, destination));
}
