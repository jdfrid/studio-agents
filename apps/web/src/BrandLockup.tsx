type BrandLockupProps = {
  tagline?: string;
  compact?: boolean;
};

/** Wordmark stays LTR; the symbol is not mirrored in RTL. */
export function BrandLockup({ tagline, compact }: BrandLockupProps) {
  return (
    <span className="brand-lockup-inner">
      <img className="brand-symbol" src="/brand/symbol-forest.svg" alt="" width={39} height={39} />
      {compact ? null : (
        <span className="brand-copy">
          <strong className="brand">Reelmino</strong>
          {tagline ? <small>{tagline}</small> : null}
        </span>
      )}
    </span>
  );
}
