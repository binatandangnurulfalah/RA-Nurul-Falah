import { Component, type ErrorInfo, type ReactNode } from 'react'

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
      <main className="fatal-error" role="alert">
        <section>
          <h1>Terjadi kesalahan pada halaman ini.</h1>
          <p>Data Anda tidak dihapus. Muat ulang aplikasi untuk mencoba kembali.</p>
          <button className="button button--primary" type="button" onClick={() => window.location.reload()}>Muat Ulang</button>
        </section>
      </main>
    )
  }
}
