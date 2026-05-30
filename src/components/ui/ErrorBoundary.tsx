import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card text-card-foreground shadow-lg p-8 text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center mb-5">
            <AlertTriangle className="h-7 w-7 text-destructive" strokeWidth={1.75} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
          <p className="text-sm text-muted-foreground mt-2">
            We hit an unexpected error while loading this page. Please reload to try again. If this keeps happening, contact support.
          </p>
          <Button onClick={this.handleReload} className="mt-6 w-full" size="lg">
            <RotateCw className="h-4 w-4" />
            Reload page
          </Button>
          {import.meta.env.DEV && this.state.error && (
            <details className="mt-5 text-left">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Technical details
              </summary>
              <pre className="mt-2 text-[11px] leading-relaxed bg-muted text-muted-foreground rounded-md p-3 overflow-auto max-h-48 whitespace-pre-wrap">
                {this.state.error.message}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
