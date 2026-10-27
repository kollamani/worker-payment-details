import React, { useEffect, useRef } from 'react';

/**
 * Native checkbox with a proper indeterminate state.
 *
 * `indeterminate` is a DOM-only property, so it must be assigned through a ref
 * whenever the parent's selection is partial. The visible `checked` state is
 * still controlled by React.
 */
const SelectionCheckbox = ({ checked, indeterminate = false, onChange, label, disabled = false }) => {
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = Boolean(indeterminate && !checked);
    }
  }, [indeterminate, checked]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      checked={Boolean(checked)}
      onChange={onChange}
      disabled={disabled}
      aria-label={label}
      className="h-4 w-4 cursor-pointer rounded border-line-strong bg-surface accent-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
};

export default SelectionCheckbox;
