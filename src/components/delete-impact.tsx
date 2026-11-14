/** The body of a delete warning: what goes with the record and what stays. */
export function DeleteImpact({
  removes,
  keeps,
}: {
  removes: string[]
  keeps: string[]
}) {
  return (
    <span className="grid gap-3">
      <span>
        This permanently deletes the order
        {removes.length > 0 ? ` along with ${removes.join(' and ')}` : ''}. It cannot be undone.
      </span>
      {keeps.length > 0 ? (
        <span className="grid gap-1">
          <span className="font-medium text-zinc-950 dark:text-white">What stays</span>
          {keeps.map((text) => (
            <span key={text} className="flex gap-2">
              <span aria-hidden="true">•</span>
              {text}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  )
}
