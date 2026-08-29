import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const functions = ["scenario", "ingest", "deliver", "query", "diagnose"];

await Promise.all(
  functions.map(async (name) => {
    const outputDirectory = `.build/functions/${name}`;
    await mkdir(outputDirectory, { recursive: true });
    await build({
      entryPoints: [`services/functions/${name}.ts`],
      outfile: `${outputDirectory}/index.mjs`,
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node24",
      sourcemap: "linked",
      minify: false,
      legalComments: "none",
      banner: {
        js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
      },
    });
  }),
);

await Promise.all(
  functions.map(async (name) => {
    const bundleUrl = pathToFileURL(resolve(`.build/functions/${name}/index.mjs`)).href;
    const bundle = await import(bundleUrl);
    if (typeof bundle.handler !== "function") {
      throw new Error(`Built ${name} bundle does not export a handler function`);
    }
  }),
);
