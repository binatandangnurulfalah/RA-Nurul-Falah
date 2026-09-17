import { Skeleton } from '../ui/Skeleton'

export function StatCardSkeleton() {
  return <div className="data-stat-card data-stat-card--skeleton" aria-hidden="true"><Skeleton className="data-stat-card__icon" /><div className="data-stat-card__content"><Skeleton style={{ width: '45%' }} /><Skeleton style={{ width: '32%', height: 28 }} /><Skeleton style={{ width: '58%' }} /></div></div>
}

export function MobileCardSkeleton() {
  return <div className="mobile-data-card mobile-data-card--skeleton" aria-hidden="true"><div className="mobile-data-card__header"><Skeleton className="mobile-data-card__leading" /><div className="mobile-data-card__title"><Skeleton style={{ width: '56%', height: 18 }} /><Skeleton style={{ width: '38%' }} /></div></div><div className="mobile-data-card__fields"><Skeleton style={{ height: 36 }} /><Skeleton style={{ height: 36 }} /></div></div>
}

export function DataListSkeleton({ count = 4 }: { count?: number }) {
  return <div className="mobile-data-list" aria-label="Memuat data">{Array.from({ length: count }, (_, index) => <MobileCardSkeleton key={index} />)}</div>
}
