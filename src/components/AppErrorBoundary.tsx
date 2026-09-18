import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { reportOperationalError } from '../lib/observability'
import { applyWaitingPwaUpdate } from '../pwa/registerPwa'

type ErrorBoundaryState = {
  failed: boolean
  chunkLoadFailure: boolean
}

function isChunkLoadFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed|ChunkLoadError/i.test(message)
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false, chunkLoadFailure: false }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { failed: true, chunkLoadFailure: isChunkLoadFailure(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportOperationalError('react-boundary', error, { component_stack_present: Boolean(info.componentStack) })
  }

  private recover = async () => {
    if (this.state.chunkLoadFailure && navigator.onLine) {
      const updateApplied = await applyWaitingPwaUpdate().catch(() => false)
      if (updateApplied) return
    }
    window.location.reload()
  }

  render() {
    if (!this.state.failed) return this.props.children

    const title = this.state.chunkLoadFailure
      ? 'Versi halaman perlu diperbarui.'
      : 'Terjadi kesalahan pada halaman ini.'
    const description = this.state.chunkLoadFailure
      ? 'Aplikasi mendeteksi bundle halaman yang sudah tidak cocok dengan versi terbaru. Muat versi terbaru untuk melanjutkan dengan aman.'
      : 'Muat ulang halaman untuk mencoba kembali. Jika masalah tetap muncul, kembali ke menu sebelumnya lalu ulangi proses.'

    return (
      <main className="app-error-boundary" role="alert">
        <AlertTriangle size={30} />
        <h1>{title}</h1>
        <p>{description}</p>
        <button type="button" onClick={() => void this.recover()}>
          <RefreshCw size={17} /> {this.state.chunkLoadFailure ? 'Muat Versi Terbaru' : 'Muat Ulang'}
        </button>
      </main>
    )
  }
}
