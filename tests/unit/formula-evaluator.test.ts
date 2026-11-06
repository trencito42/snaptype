import { describe, it, expect } from 'vitest';
import { SafeFormulaEvaluator } from '@snaptype/snippet-engine';

describe('SafeFormulaEvaluator', () => {
  const evaluator = new SafeFormulaEvaluator();

  it('evaluates basic arithmetic operations safely', () => {
    expect(evaluator.evaluate('2 + 3')).toBe(5);
    expect(evaluator.evaluate('10 - 4')).toBe(6);
    expect(evaluator.evaluate('6 * 7')).toBe(42);
    expect(evaluator.evaluate('20 / 4')).toBe(5);
    expect(evaluator.evaluate('10 % 3')).toBe(1);
  });

  it('respects operator precedence and parentheses', () => {
    expect(evaluator.evaluate('2 + 3 * 4')).toBe(14);
    expect(evaluator.evaluate('(2 + 3) * 4')).toBe(20);
    expect(evaluator.evaluate('100 / (5 + 5)')).toBe(10);
  });

  it('evaluates variables from context', () => {
    const vars = { price: 50, quantity: 3, taxRate: 0.2 };
    expect(evaluator.evaluate('price * quantity', vars)).toBe(150);
    expect(evaluator.evaluate('price * (1 + taxRate)', vars)).toBe(60);
  });

  it('supports comparison operators', () => {
    expect(evaluator.evaluate('5 > 3')).toBe(true);
    expect(evaluator.evaluate('10 == 10')).toBe(true);
    expect(evaluator.evaluate('4 <= 2')).toBe(false);
  });

  it('handles division by zero safely without crashing', () => {
    expect(evaluator.evaluate('10 / 0')).toBe(0);
  });

  it('handles string concatenation', () => {
    expect(evaluator.evaluate('"Hello " + "world"')).toBe('Hello world');
  });
});

