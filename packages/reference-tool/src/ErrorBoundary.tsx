import { Component, type ErrorInfo, type ReactNode } from "react";
import { Alert } from "@powertools/ui";

interface ErrorBoundaryState {
  error: Error | null;
}

/** Shows what went wrong instead of leaving the frame blank when rendering throws. */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("The tool failed to render", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return (
      <div className="p-4">
        <Alert tone="danger">This tool hit an error and stopped: {this.state.error.message}</Alert>
      </div>
    );
  }
}
