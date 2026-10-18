import { useEffect, useRef, useState } from 'react';
import { parseDecimalDraft } from '../../lib/fabrication/decimal-input.mjs';

export default function DecimalInput({ value, onChange, ...props }) {
  const [draft, setDraft] = useState(String(value ?? ''));
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setDraft(String(value ?? '')); }, [value]);
  function finish() {
    editing.current = false;
    const parsed = parseDecimalDraft(draft.replace(/[.,]$/, ''));
    if (parsed.complete) {
      if (parsed.value !== value) onChange(parsed.value);
      setDraft(String(parsed.value ?? ''));
    } else setDraft(String(value ?? ''));
  }
  return <input {...props} type="text" inputMode="decimal" value={draft}
    onFocus={() => { editing.current = true; }}
    onChange={event => {
      const raw = event.target.value;
      const parsed = parseDecimalDraft(raw);
      if (!parsed.valid) return;
      setDraft(raw);
      if (parsed.complete) onChange(parsed.value);
    }}
    onBlur={finish}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
}
