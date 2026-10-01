type ActiveConnectionSnapshot = {
  name: string | null;
  loaded: boolean;
};

let snapshot: ActiveConnectionSnapshot = { name: null, loaded: false };

export function setActiveConnectionSnapshot(
  name: string | null,
  loaded: boolean,
): void {
  snapshot = { name, loaded };
}

export function getActiveConnectionSnapshot(): ActiveConnectionSnapshot {
  return snapshot;
}
