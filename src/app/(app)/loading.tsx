import { Skeleton, SkeletonCard, SkeletonTable } from '@/components/skeleton'

export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="grid grid-cols-1 gap-6">
      <span className="sr-only">Loading…</span>
      <div className="grid gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
      <SkeletonTable rows={6} columns={4} />
    </div>
  )
}
