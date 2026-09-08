import React from 'react';

export default function ArpaPageHeader({ eyebrow, title, subtitle, actions, className = '' }) {
  return (
    <header className={`arpaPageHeader ${className}`.trim()}>
      <div className="arpaPageHeader__copy">
        {eyebrow && <div className="arpaPageHeader__eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="arpaPageHeader__actions">{actions}</div>}
    </header>
  );
}
