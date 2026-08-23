/**
 * Clinical Cascade Field boundary: a self-contained recovery surface for runtime errors without template UI dependencies.
 */
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-screen place-items-center bg-[#050506] p-8 text-[#f0f0f2]">
          <section className="w-full max-w-2xl border border-[#34343a] bg-[#111113] p-8 text-center">
            <AlertTriangle size={48} className="mx-auto mb-6 text-[#f87171]" />
            <h2 className="text-xl">An unexpected error occurred.</h2>
            <pre className="mt-5 max-h-48 overflow-auto border border-[#34343a] bg-[#09090a] p-4 text-left font-mono text-xs leading-5 text-[#a1a1aa] whitespace-break-spaces">{this.state.error?.stack}</pre>
            <button type="button" onClick={() => window.location.reload()} className="mt-6 inline-flex items-center gap-2 border border-[#52525b] bg-[#1b1b1e] px-4 py-2.5 font-mono text-xs transition-colors hover:bg-[#29292d] active:scale-[.98]"><RotateCcw size={16} /> Reload page</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
