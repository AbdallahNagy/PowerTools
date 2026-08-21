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
        <div role="alert" className="m-4 rounded border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-100">
          <p className="font-semibold">
            {this.props.toolTitle} encountered an unexpected error.
          </p>
          <p className="mt-1 text-red-200">
            Close and reopen this tab to try again.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
