interface FetchResultSummaryInput {
  fetchedCount: number;
  totalEstimate: number | null;
  moreRecords?: boolean;
}

const numberFormatter = new Intl.NumberFormat("en-US");

export function formatFetchResultSummary({
  fetchedCount,
  totalEstimate,
}: FetchResultSummaryInput): string {
  const parts = [`${numberFormatter.format(fetchedCount)} records fetched`];

  if (totalEstimate != null) {
    parts.push(`${numberFormatter.format(totalEstimate)} total matching records`);
  }

  return parts.join(" - ");
}
