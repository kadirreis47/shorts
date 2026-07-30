import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ShortsFlow arayüz hatası:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-xl rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">ShortsFlow başlatılamadı</h1>
          <p className="mt-2 text-sm text-slate-600">
            Beyaz ekran yerine hata ayrıntısı gösteriliyor. Aşağıdaki mesajı geliştiriciyle paylaşabilirsiniz.
          </p>
          <pre className="mt-4 max-h-56 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
            {this.state.error.message}
          </pre>
          <button
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            onClick={() => window.location.reload()}
          >
            Yeniden yükle
          </button>
        </div>
      </div>
    );
  }
}
