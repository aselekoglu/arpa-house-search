import React from 'react';

export default function ArpaInput({ className = '', prefix, onChange, type = 'text', ...props }) {
  return (
    <label className={`arpaInput ${className}`.trim()}>
      {prefix && <span className="arpaInput__prefix">{prefix}</span>}
      <input
        className="arpaInput__control"
        type={type}
        onChange={(event) => onChange?.(event.target.value, event)}
        {...props}
      />
    </label>
  );
}
