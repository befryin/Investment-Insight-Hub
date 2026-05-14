import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';

interface MathInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onValueChange: (val: number) => void;
  value: number;
}

export function MathInput({ value, onValueChange, className, ...props }: MathInputProps) {
  const [displayValue, setDisplayValue] = useState(value === 0 ? '' : String(value));

  useEffect(() => {
    // Only update if it doesn't match roughly (to not override user typing "10+")
    const currentNum = parseFloat(displayValue);
    if (!isNaN(currentNum) && currentNum === value && !displayValue.match(/[\+\-\*\/\(\)]/)) {
      // It's the same, do nothing
    } else if (value !== 0 && isNaN(currentNum)) {
      setDisplayValue(String(value));
    }
  }, [value]);

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    let expr = displayValue.trim();
    if (!expr) {
      onValueChange(0);
      setDisplayValue('');
      if (props.onBlur) props.onBlur(e);
      return;
    }

    try {
      // Safe eval using Function
      // Only allow numbers and basic math operators
      if (/^[0-9\+\-\*\/\(\)\.\s]+$/.test(expr)) {
        // eslint-disable-next-line no-new-func
        const result = new Function(`return (${expr})`)();
        if (typeof result === 'number' && !isNaN(result)) {
          // Format to 2 decimal places
          const rounded = Math.round(result * 100) / 100;
          setDisplayValue(String(rounded));
          onValueChange(rounded);
        }
      } else {
        // If it's invalid, just try to parse float
        const num = parseFloat(expr);
        if (!isNaN(num)) {
          setDisplayValue(String(num));
          onValueChange(num);
        }
      }
    } catch (err) {
      // Ignore eval errors, just try to parse float
      const num = parseFloat(expr);
      if (!isNaN(num)) {
        setDisplayValue(String(num));
        onValueChange(num);
      }
    }
    
    if (props.onBlur) props.onBlur(e);
  };

  return (
    <Input
      {...props}
      type="text"
      className={className}
      value={displayValue}
      onChange={(e) => setDisplayValue(e.target.value)}
      onBlur={handleBlur}
    />
  );
}
