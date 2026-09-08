import React from 'react';

export default function ArpaButton({ children, className = '', variant = 'primary', type = 'button', ...props }) {
  return (
    <button type={type} className={`arpaButton arpaButton--${variant} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
