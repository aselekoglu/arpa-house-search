import React from 'react';

export default function ArpaPanel({ as: Component = 'section', className = '', children, ...props }) {
  return (
    <Component className={`arpaPanel ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
}
