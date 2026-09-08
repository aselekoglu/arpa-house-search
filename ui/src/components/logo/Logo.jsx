import React from 'react';
import './Logo.less';

export default function Logo({ compact = false, width } = {}) {
  const style = width ? { '--arpa-lockup-width': `${width}px` } : undefined;

  return (
    <div className={`arpaLogo${compact ? ' arpaLogo--compact' : ''}`} style={style} aria-label="ARPA House Search">
      <span className="arpaLogo__icon" aria-hidden="true" />
      {!compact && (
        <span className="arpaLogo__wordmark">
          <strong>ARPA</strong>
          <span>HOUSE SEARCH</span>
        </span>
      )}
    </div>
  );
}
