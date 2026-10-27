/**
 * A photograph from `public/images`, exported by width as `<name>-<width>.avif` and `.webp`.
 * `widths` lists them smallest first; `sizes` says how wide it is drawn. For a scene that needs a
 * different crop on a phone, `tall` names a portrait export used below 720px.
 */
export function Photo({
  name,
  widths,
  alt,
  sizes = '100vw',
  tall,
  className,
  priority = false,
}: {
  name: string
  widths: number[]
  alt: string
  sizes?: string
  tall?: { name: string; widths: number[] }
  className?: string
  priority?: boolean
}) {
  const set = (n: string, ws: number[], ext: string) => ws.map((w) => `/images/${n}-${w}.${ext} ${w}w`).join(', ')
  const largest = widths[widths.length - 1]
  return (
    <picture className={className}>
      {tall ? (
        <>
          <source media="(max-width: 719px) and (orientation: portrait)" type="image/avif" srcSet={set(tall.name, tall.widths, 'avif')} sizes="100vw" />
          <source media="(max-width: 719px) and (orientation: portrait)" type="image/webp" srcSet={set(tall.name, tall.widths, 'webp')} sizes="100vw" />
        </>
      ) : null}
      <source type="image/avif" srcSet={set(name, widths, 'avif')} sizes={sizes} />
      <source type="image/webp" srcSet={set(name, widths, 'webp')} sizes={sizes} />
      <img
        src={`/images/${name}-${largest}.webp`}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
      />
    </picture>
  )
}
