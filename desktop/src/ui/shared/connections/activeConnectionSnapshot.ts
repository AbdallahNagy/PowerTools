type ActiveConnectionSnapshot = {
  id: string | null;
  loaded: boolean;
};

let snapshot: ActiveConnectionSnapshot = { id: null, loaded: false };

export function setActiveConnectionSnapshot(
  id: string | null,
  loaded: boolean,
): void {
  snapshot = { id, loaded };
}

export function getActiveConnectionSnapshot(): ActiveConnectionSnapshot {
  return snapshot;
}
