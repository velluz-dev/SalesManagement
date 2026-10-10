import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { NumberInput, sanitizeNumber } from '../components/ui/Form';

describe('sanitizeNumber', () => {
  it('drops letters, symbols and minus signs', () => {
    expect(sanitizeNumber('abc')).toBe('');
    expect(sanitizeNumber('7%')).toBe('7');
    expect(sanitizeNumber('-5')).toBe('5');
    expect(sanitizeNumber('1e5')).toBe('15');
  });

  it('keeps one decimal point and limits decimals', () => {
    expect(sanitizeNumber('12.345')).toBe('12.34');
    expect(sanitizeNumber('1.2.3')).toBe('1.23');
    expect(sanitizeNumber('.5')).toBe('0.5');
    expect(sanitizeNumber('3.')).toBe('3.');
  });

  it('cleans pasted amounts with thousands separators', () => {
    expect(sanitizeNumber('1,250,000 MMK')).toBe('1250000');
  });

  it('caps percentages and whole-number fields', () => {
    expect(sanitizeNumber('150', { maxValue: 100 })).toBe('100');
    expect(sanitizeNumber('7.5', { decimals: 0, maxValue: 365 })).toBe('75');
    expect(sanitizeNumber('12345678901234')).toBe('123456789012'); // 12 integer digits
  });

  it('removes leading zeros', () => {
    expect(sanitizeNumber('0007')).toBe('7');
    expect(sanitizeNumber('0')).toBe('0');
    expect(sanitizeNumber('00.5')).toBe('0.5');
  });
});

function TaxField() {
  const [v, setV] = useState('');
  return <NumberInput aria-label="Tax %" maxValue={100} value={v} onChange={(e) => setV(e.target.value)} />;
}

describe('NumberInput', () => {
  it('never holds non-numeric text', () => {
    render(<TaxField />);
    const input = screen.getByLabelText('Tax %') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'seven' } });
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '7.25abc' } });
    expect(input.value).toBe('7.25');
    fireEvent.change(input, { target: { value: '250' } });
    expect(input.value).toBe('100');
  });

  it('uses a numeric keyboard on mobile', () => {
    render(<TaxField />);
    expect(screen.getByLabelText('Tax %')).toHaveAttribute('inputmode', 'decimal');
  });
});
