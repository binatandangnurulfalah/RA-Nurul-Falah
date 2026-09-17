export function Skeleton({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`skeleton-stack ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => <span className="skeleton-line" key={index} />)}
    </div>
  )
}
