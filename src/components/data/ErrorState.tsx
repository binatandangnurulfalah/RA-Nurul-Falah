import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '../ui/Button'

type ErrorStateProps = {
  title?: string
  description?: string
  actionLabel?: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({ title = 'Data gagal dimuat', description = 'Terjadi kendala saat mengambil data. Silakan coba kembali.', actionLabel = 'Coba Lagi', onRetry, className = '' }: ErrorStateProps) {
  return (
    <section className={['data-error-state', className].filter(Boolean).join(' ')} role="alert">
      <span className="data-error-state__icon" aria-hidden="true"><AlertTriangle size={24} /></span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {onRetry ? <Button variant="secondary" onClick={onRetry}><RefreshCw size={16} aria-hidden="true" /> {actionLabel}</Button> : null}
    </section>
  )
}
