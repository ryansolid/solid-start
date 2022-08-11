import { spawn } from "child_process";
import { copyFileSync, readdirSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import renderStatic from "solid-ssr/static";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getAllFiles(dirPath, pageRoot, arrayOfFiles) {
  const files = readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(file => {
    if (statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, pageRoot, arrayOfFiles);
    } else if (file.endsWith("sx") && !file.match(/\[.*\]/)) {
      arrayOfFiles.push(
        join(dirPath, "/", file)
          .replace(pageRoot, "")
          .replace(/\\/g, "/")
          .replace(/(\/index)?(.jsx|.tsx)/, "") || "/"
      );
    }
  });

  return arrayOfFiles;
}

export default function () {
  return {
    start(config, { port }) {
      process.env.PORT = port;
      const proc = spawn("npx", ["sirv-cli", "./dist/public", "--port", `${process.env.PORT}`]);
      proc.stdout.pipe(process.stdout);
      proc.stderr.pipe(process.stderr);

      return `http://localhost:${process.env.PORT}`;
    },
    async build(config, builder) {
      const appRoot = config.solidOptions.appRoot;
      await builder.client(join(config.root, "dist", "public"));
      await builder.server(join(config.root, ".solid", "server"));
      copyFileSync(
        join(config.root, ".solid", "server", `entry-server.js`),
        join(config.root, ".solid", "server", "handler.js")
      );
      const pathToServer = join(config.root, ".solid", "server", "server.js");
      copyFileSync(join(__dirname, "entry.js"), pathToServer);
      const pathToDist = resolve(config.root, "dist", "public");
      const pageRoot = join(config.root, appRoot, config.solidOptions.routesDir);
      const routes = [
        ...getAllFiles(pageRoot, pageRoot),
        ...(config.solidOptions.prerenderRoutes || [])
      ];
      renderStatic(
        routes.map(url => ({
          entry: pathToServer,
          output: join(pathToDist, url.length === 1 ? "index.html" : `${url.slice(1)}.html`),
          url
        }))
      );
    }
  };
}
