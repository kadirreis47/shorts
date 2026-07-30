import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Ekran yüklenirken hata oluştu:', error, info.componentStack);
  }

  componentDidUpdate(previousProps: Props) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="mx-auto mt-10 max-w-2xl rounded-xl border border-red-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-red-700">Bu ekran yüklenemedi</h2>
        <p className="mt-2 text-sm text-slate-600">
          Uygulamanın tamamı kapanmadı. Başka bir menüye geçebilir veya bu ekranı yeniden deneyebilirsin.
        </p>
        <pre className="mt-4 max-h-48 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
          {this.state.error.message || 'Bilinmeyen hata'}
        </pre>
        <button
          type="button"
          onClick={this.retry}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Yeniden dene
        </button>
      </div>
    );
  }
}
