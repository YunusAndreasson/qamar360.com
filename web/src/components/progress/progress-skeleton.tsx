import { Panel } from '#/components/console'
import { Skeleton } from '#/components/ui/skeleton'

/** Loading placeholder shaped like the progress bento, so the layout doesn't jump on load. */
export function ProgressSkeleton() {
  return (
    <div className="grid grid-cols-12 gap-4">
      <Panel framed className="col-span-12 flex flex-col items-center gap-5 p-6 lg:col-span-5">
        <Skeleton className="size-52 rounded-full" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-3 w-40" />
      </Panel>
      <Panel className="col-span-12 p-4 lg:col-span-7">
        <Skeleton className="mb-4 h-4 w-24" />
        <Skeleton className="h-[220px] w-full rounded-md" />
      </Panel>
      {Array.from({ length: 4 }).map((_, i) => (
        <Panel key={i} className="col-span-6 p-4 lg:col-span-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-8 w-16" />
        </Panel>
      ))}
      <Panel className="col-span-12 p-4">
        <Skeleton className="mb-4 h-4 w-32" />
        <Skeleton className="h-32 w-full rounded-md" />
      </Panel>
    </div>
  )
}
