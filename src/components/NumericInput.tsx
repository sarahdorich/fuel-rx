'use client'

import { useRef, InputHTMLAttributes } from 'react'

interface NumericInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type' | 'inputMode' | 'pattern'> {
  value: number | ''
  onChange: (value: number) => void
  min?: number
  max?: number
  allowEmpty?: boolean
}

export default function NumericInput({
  value,
  onChange,
  min,
  max,
  allowEmpty = true,
  className = '',
  ...props
}: NumericInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value

    // Allow empty input
    if (rawValue === '') {
      if (allowEmpty) {
        onChange(0)
      }
      return
    }

    // Only allow digits
    if (!/^\d*$/.test(rawValue)) {
      return
    }

    let numValue = parseInt(rawValue, 10)

    // Apply min/max constraints
    if (min !== undefined && numValue < min) {
      numValue = min
    }
    if (max !== undefined && numValue > max) {
      numValue = max
    }

    onChange(numValue)
  }

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Select all text on focus for easy replacement
    e.target.select()
    props.onFocus?.(e)
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value === 0 && allowEmpty ? '' : value}
      onChange={handleChange}
      onFocus={handleFocus}
      className={className}
      {...props}
    />
  )
}
