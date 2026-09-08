import React from 'react';

export default function ArpaDivider({ className = '', ...props }) {
  return <hr className={`arpaDivider ${className}`.trim()} {...props} />;
}
