import { useState } from 'react';

export default function UtilityBar() {
  const [fontScale, setFontScale] = useState(1);

  function applyScale(scale) {
    const clamped = Math.min(1.15, Math.max(0.9, scale));
    setFontScale(clamped);
    document.documentElement.style.fontSize = `${clamped * 100}%`;
  }

  return (
    <div className="utility-bar">
      <a href="#main-content">Skip to main content</a>
      <div className="utility-right">
        <span>Screen reader access</span>
        <button onClick={() => applyScale(fontScale - 0.05)} aria-label="Decrease text size">A-</button>
        <button onClick={() => applyScale(1)} aria-label="Reset text size">A</button>
        <button onClick={() => applyScale(fontScale + 0.05)} aria-label="Increase text size">A+</button>
      </div>
    </div>
  );
}