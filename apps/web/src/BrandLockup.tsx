type BrandLockupProps = {
  tagline?: string;
  compact?: boolean;
  variant?: "primary" | "white";
};

/** Official lockup. Wordmark stays LTR; the symbol is not mirrored in RTL. */
export function BrandLockup({ compact, variant = "primary" }: BrandLockupProps) {
  const logo = variant === "white" ? "/brand/logo-white.svg" : "/brand/logo-primary.svg";
  return (
    <span className={`brand-lockup-inner${compact ? " is-compact" : ""}`}>
      <img className="brand-logo" src={logo} alt="Reelmino" width={168} height={42} />
      <img className="brand-symbol" src="/brand/symbol-primary.svg" alt="" width={39} height={39} />
    </span>
  );
}
