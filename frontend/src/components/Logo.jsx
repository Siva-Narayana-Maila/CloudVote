// Placeholder mark: a wax-seal-style badge with a ballot-drop glyph, tying
// into the app's own "sealed ballot" language. To swap in a real logo file
// later, just replace the <svg> below with an <img src="..." /> — nothing
// else using <Logo /> across the app needs to change.
export default function Logo({ size = 32, showWordmark = true, wordmarkSize = 16, variant = 'default' }) {
  const wordColor = variant === 'light' ? '#faf3e8' : 'var(--color-burgundy-900)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="23" fill="var(--color-burgundy-900)" stroke="var(--color-gold)" strokeWidth="1.5" />
        <circle cx="24" cy="24" r="18" fill="none" stroke="var(--color-gold)" strokeWidth="0.75" opacity="0.5" />
        <path
          d="M24 14 L24 30 M17 21 L24 14 L31 21"
          stroke="var(--color-gold)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <rect x="15" y="30" width="18" height="3" rx="1.5" fill="var(--color-gold)" />
      </svg>
      {showWordmark && (
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: wordmarkSize,
            color: wordColor,
            letterSpacing: 0.2,
          }}
        >
          Ballot<span style={{ color: 'var(--color-gold)' }}>ique</span>
        </span>
      )}
    </div>
  );
}