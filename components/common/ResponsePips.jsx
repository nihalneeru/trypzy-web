'use client';

/**
 * ResponsePips — visual indicator of group response progress.
 * Renders filled/empty dots: ●●●●○○○
 *
 * Usage: <ResponsePips responded={4} total={7} />
 */
export function ResponsePips({ responded = 0, total = 0, maxDisplay = 12 }) {
  const clamped = Math.min(responded, total);
  const overflow = total > maxDisplay ? total - maxDisplay : 0;
  const displayTotal = overflow > 0 ? maxDisplay : total;
  const displayFilled = Math.min(clamped, displayTotal);

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: displayTotal }, (_, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full animate-pip-pop ${
            i < displayFilled ? 'bg-brand-blue' : 'bg-brand-carbon/20'
          }`}
          style={{ animationDelay: `${i * 40}ms` }}
        />
      ))}
      {overflow > 0 && (
        <span className="text-xs text-brand-carbon/50 ml-0.5">
          +{overflow} more
        </span>
      )}
    </div>
  );
}
