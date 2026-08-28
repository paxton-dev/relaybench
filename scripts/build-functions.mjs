import { mkdir } from "node:fs/promises";
import { build } from "esbuild";

const functions = ["scenario", "ingest", "deliver", "query"];

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
    });
  }),
);
