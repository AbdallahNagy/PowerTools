import type { ReactNode } from "react";
import { Button, SearchInput, Spinner } from "../../../shared/ui";

/** A searchable list with loading and retry states. */
export function ListSection({
  title,
  showHeading = true,
  search,
  onSearch,
  placeholder,
  loading,
  error,
  onRetry,
  children,
}: {
  title: string;
  showHeading?: boolean;
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {showHeading ? <h2 className="text-sm text-fg-strong">{title}</h2> : null}
      <SearchInput value={search} onChange={onSearch} placeholder={placeholder} />
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-fg">
          <Spinner />
        </div>
      ) : null}
      {error ? (
        <div className="flex items-center gap-2 text-sm text-fg">
          <span>{error}</span>
          <Button variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : loading ? null : (
        children
      )}
    </div>
  );
}
