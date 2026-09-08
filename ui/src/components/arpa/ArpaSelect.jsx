import React from 'react';

export default function ArpaSelect({ className = '', options = [], onChange, children, ...props }) {
  return (
    <select
      className={`arpaSelect ${className}`.trim()}
      onChange={(event) => onChange?.(event.target.value, event)}
      {...props}
    >
      {children ||
        options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
    </select>
  );
}
