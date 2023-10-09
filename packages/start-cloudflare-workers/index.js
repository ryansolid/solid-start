/// <reference types="node" />

import common from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import { spawn } from "child_process";
import { copyFileSync, readFileSync, writeFileSync } from "fs";
import { Miniflare } from "miniflare";
import { dirname, join } from "path";
import { rollup } from "rollup";
import { fileURLToPath } from "url";
import { createServer } from "./dev-server.js";

export default function (miniflareOptions = {}) {
  return {
    name: "cloudflare-workers",
    async dev(options, vite, dev) {
      if (options.solidOptions.experimental?.websocket) {
        if (!miniflareOptions.durableObjects) {
          miniflareOptions.durableObjects = {};
        }
        miniflareOptions.durableObjects["DO_WEBSOCKET"] = "DO_WEBSOCKET";
      }
      let durableObjects = Object.keys(miniflareOptions.durableObjects ?? {});
      let globs = {};
      durableObjects.forEach(obj => {
        console.log(obj);
        globs[obj + "Proxy"] = class DO {
          state;
          env;
          promise;
          constructor(state, env) {
            this.state = state;
            this.env = env;
            this.promise = this.createProxy(state, env);
            this.ctx = {
              state,
              storage: state.storage,
              durableObject: this
            };
          }

          async createProxy(state, env) {
            // const all = await vite.ssrLoadModule("~start/entry-server");
            // return new all[obj](state, env);
          }

          async fetch(request) {
            console.log("🧬", obj, request.method, request.url);

            try {
              const all = await vite.ssrLoadModule("~start/entry-server");
              console.log(all[obj].prototype.fetch);
              // let dObject = await this.promise;
              return await all[obj].prototype.fetch.call(this, request, this.ctx);
            } catch (e) {
              console.log("error", e);
            }
          }
        };
      });

      const mf = new Miniflare({
        script: `
        export default {
          fetch: async (request, env) => {
            return await serve(request, env, globalThis);
          }
        }

        ${durableObjects.map(obj => `export const ${obj} = ${obj}Proxy;`).join("\n")}
      `,
        globals: {
          ...globs,
          serve: async (req, e, g) => {
            const {
              Request,
              Response,
              fetch,
              crypto,
              Headers,
              ReadableStream,
              WritableStream,
              WebSocketPair,
              TransformStream
            } = g;
            Object.assign(globalThis, {
              Request,
              Response,
              fetch,
              crypto,
              Headers,
              ReadableStream,
              WritableStream,
              TransformStream,
              WebSocketPair
            });

            console.log(
              "🔥",
              req.headers.get("Upgrade") === "websocket" ? "WEBSOCKET" : req.method,
              req.url
            );

            if (req.headers.get("Upgrade") === "websocket") {
              const url = new URL(req.url);
              console.log("WEBSOCKET", url.search);
              const durableObjectId = e.DO_WEBSOCKET.idFromName(url.pathname + url.search);
              const durableObjectStub = e.DO_WEBSOCKET.get(durableObjectId);
              const response = await durableObjectStub.fetch(req);
              return response;
            }

            try {
              return await dev.fetch({
                request: req,
                env: e,
                clientAddress: req.headers.get("cf-connecting-ip"),
                locals: {}
              });
            } catch (e) {
              console.log("error", e);
              return new Response(e.toString(), { status: 500 });
            }
          }
        },
        modules: true,
        kvPersist: true,
        compatibilityFlags: ["streams_enable_constructors"],
        ...miniflareOptions,
        durableObjects: Object.fromEntries(durableObjects.map(obj => [obj, obj]))
      });

      console.log("🔥", "starting miniflare");

      miniflareOptions.init?.(mf);

      return await createServer(vite, mf, {});
    },
    start(config, { port }) {
      process.env.PORT = port;
      const proc = spawn("node", [
        join(config.root, "node_modules", "wrangler", "bin", "wrangler.js"),
        "dev",
        "./dist/server.js",
        "--site",
        "./dist/public",
        "--port",
        process.env.PORT
      ]);
      proc.stdout.pipe(process.stdout);
      proc.stderr.pipe(process.stderr);
      return `http://localhost:${process.env.PORT}`;
    },
    async build(config, builder) {
      const __dirname = dirname(fileURLToPath(import.meta.url));

      if (!config.solidOptions.ssr) {
        await builder.spaClient(join(config.root, "dist", "public"));
        await builder.server(join(config.root, ".solid", "server"));
      } else if (config.solidOptions.experimental.islands) {
        await builder.islandsClient(join(config.root, "dist", "public"));
        await builder.server(join(config.root, ".solid", "server"));
      } else {
        await builder.client(join(config.root, "dist", "public"));
        await builder.server(join(config.root, ".solid", "server"));
      }

      copyFileSync(join(__dirname, "entry.js"), join(config.root, ".solid", "server", "server.js"));
      let durableObjects = Object.keys(config.solidOptions.experimental?.durableObjects || {});

      if (durableObjects.length > 0) {
        let text = readFileSync(join(config.root, ".solid", "server", "server.js"), "utf8");
        durableObjects.forEach(item => {
          text += `\n import ${item}Fetch from "./${item}"; 
          
          class ${item} {
            ctx;
            constructor(state) {
              this.ctx = {
                state,
                storage: state.storage,
                durableObject: this
              };
            }
            async fetch(request) {
              return await ${item}Fetch(request, this.ctx);
            }
          }

          export { ${item} } from "./entry-server";`;
        });
        writeFileSync(join(config.root, ".solid", "server", "server.js"), text);
      }
      const bundle = await rollup({
        input: join(config.root, ".solid", "server", "server.js"),
        plugins: [
          json(),
          nodeResolve({
            preferBuiltins: true,
            exportConditions: ["worker", "solid"]
          }),
          common({ strictRequires: true, ...config.build.commonjsOptions })
        ]
      });
      // or write the bundle to disk
      await bundle.write({ format: "esm", dir: join(config.root, "dist") });

      // closes the bundle
      await bundle.close();
    }
  };
}
