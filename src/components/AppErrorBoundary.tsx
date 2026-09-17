import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled application error', error, info)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="app-error-boundary" role="alert">
        <AlertTriangle size={30} />
        <h1>Terjadi kesalahan pada halaman ini.</h1>
        <p>Muat ulang halaman untuk mencoba kembali. Jika masalah tetap muncul, kembali ke menu sebelumnya lalu ulangi proses.</p>
        <button type="button" onClick={() => window.location.reload()}><RefreshCw size={17} /> Muat Ulang</button>
      </main>
    )
  }
}
