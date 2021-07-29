import { useContext } from "solid-js";
import { NoHydration, HydrationScript, isServer } from "solid-js/web";
import { StartContext } from "./StartContext";

function getFromManifest(manifest) {
  const match = manifest["*"];
  const entry = match.find(src => src.type === "script");
  return <script type="module" async src={entry.href} />;
}

export default function Scripts() {
  const isDev = import.meta.env.MODE === "development";
  const { manifest, port } = useContext(StartContext);
  return (
    <>
      <HydrationScript />
      <NoHydration>
        {isServer &&
          (isDev ? (
            <>
              <script type="module" src={`http://localhost:${port || 3000}/@vite/client`} $ServerOnly></script>
              <script
                type="module"
                async
                src={`http://localhost:${port || 3000}/node_modules/solid-start/runtime/entries/client.jsx`}
                $ServerOnly
              ></script>
            </>
          ) : (
            getFromManifest(manifest)
          ))}
      </NoHydration>
    </>
  );
}
