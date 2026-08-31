import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Skeleton } from '#/components/ui/skeleton'

/** Loading placeholder shaped like the progress bento, so the layout doesn't jump on load. */
export function ProgressSkeleton() {
  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-12 lg:col-span-5">
        <CardHeader>
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-5 pb-2">
          <Skeleton className="size-52 rounded-full" />
          <Skeleton className="h-14 w-28" />
          <Skeleton className="h-3 w-40" />
        </CardContent>
      </Card>
      <Card className="col-span-12 lg:col-span-7">
        <CardHeader>
          <Skeleton className="h-5 w-20" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[240px] w-full rounded-lg" />
        </CardContent>
      </Card>
      <div className="col-span-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="gap-0 py-5">
            <CardHeader className="gap-2 px-5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-14" />
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card className="col-span-12">
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full rounded-lg" />
        </CardContent>
      </Card>
    </div>
  )
}
