import { copyFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { rollup } from "rollup";
import vite from "vite";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import common from "@rollup/plugin-commonjs";

export default async function Node(config) {
  const { preferStreaming } = config.solidOptions;
  const __dirname = dirname(fileURLToPath(import.meta.url));
  await Promise.all([
    vite.build({
      build: {
        outDir: "./dist/"
      }
    }),
    vite.build({
      build: {
        ssr: `node_modules/solid-start/runtime/server/${
          preferStreaming ? "nodeStream" : "stringAsync"
        }/app.jsx`,
        outDir: "./.solid/server",
        rollupOptions: {
          output: {
            format: "esm"
          }
        }
      }
    })
  ]);
  copyFileSync(
    join(__dirname, preferStreaming ? "entry-stream.js" : "entry-async.js"),
    join(config.root, ".solid", "server", "index.js")
  );
  const bundle = await rollup({
    input: join(config.root, ".solid", "server", "index.js"),
    plugins: [
      json(),
      nodeResolve(),
      common()
    ]
  });
  // or write the bundle to disk
  await bundle.write({ format: "cjs", dir: join(config.root, "dist") });

  // closes the bundle
  await bundle.close();
}
