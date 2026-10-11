import { useEffect, useState } from "react";
import { Spinner } from "../../../shared/ui";
import { loadedLayerDiff, preloadLayerDiff, type LayerDiffProps } from "./loadLayerDiff";

/** Read-only side-by-side diff of two texts. A same-sized frame with a spinner shows until it loads. */
export function LayerDiff(props: LayerDiffProps) {
  const [Loaded, setLoaded] = useState(loadedLayerDiff);

  useEffect(() => {
    if (Loaded) return;
    let active = true;
    void preloadLayerDiff().then((component) => {
      if (active) setLoaded(() => component);
    });
    return () => {
      active = false;
    };
  }, [Loaded]);

  if (Loaded) return <Loaded {...props} />;

  return (
    <div
      aria-busy="true"
      className="flex h-full min-h-0 items-center justify-center rounded-sm border border-line bg-canvas"
    >
      <Spinner />
    </div>
  );
}
