export const START_MARKER: string;
export const END_MARKER: string;
export function renderToolTable(tools: readonly { id: string; title: string; description: string }[]): string;
export function readToolTable(readme: string): string | undefined;
export function replaceToolTable(readme: string, table: string): string;
