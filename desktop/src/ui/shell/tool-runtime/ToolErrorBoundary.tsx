import { Component, type ErrorInfo, type ReactNode } from "react";

interface ToolErrorBoundaryProps {
  toolTitle: string;
  children: ReactNode;
}

interface ToolErrorBoundaryState {
  hasError: boolean;
}

export class ToolErrorBoundary extends Component<
  ToolErrorBoundaryProps,
  ToolErrorBoundaryState
> {
  state: ToolErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ToolErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Tool "${this.props.toolTitle}" failed`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" className="m-4 rounded border border-danger/40 bg-danger-soft p-4 text-sm text-fg">
          <p className="font-semibold text-danger">
            {this.props.toolTitle} encountered an unexpected error.
          </p>
          <p className="mt-1 text-fg-muted">
            Close and reopen this tab to try again.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
