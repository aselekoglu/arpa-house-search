import React from 'react';

export default function ArpaBadge({ children, className = '', tone = 'neutral', ...props }) {
  return (
    <span className={`arpaBadge arpaBadge--${tone} ${className}`.trim()} {...props}>
      {children}
    </span>
  );
}
