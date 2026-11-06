/**
 * Safe formula evaluation using a recursive descent tokenizer and parser.
 * NO eval(), Function(), or remote code execution.
 */

type TokenType = 'NUMBER' | 'STRING' | 'IDENT' | 'OP' | 'LPAREN' | 'RPAREN' | 'EOF';

interface Token {
  type: TokenType;
  value: string;
}

class Tokenizer {
  private pos = 0;
  constructor(private input: string) {}

  public nextToken(): Token {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }

    if (this.pos >= this.input.length) {
      return { type: 'EOF', value: '' };
    }

    const char = this.input[this.pos];

    if (char === '(') {
      this.pos++;
      return { type: 'LPAREN', value: '(' };
    }
    if (char === ')') {
      this.pos++;
      return { type: 'RPAREN', value: ')' };
    }

    // Number (including decimals)
    if (/\d/.test(char) || (char === '.' && /\d/.test(this.input[this.pos + 1] || ''))) {
      let numStr = '';
      while (this.pos < this.input.length && (/[\d.]/.test(this.input[this.pos]))) {
        numStr += this.input[this.pos++];
      }
      return { type: 'NUMBER', value: numStr };
    }

    // String literal in single or double quotes
    if (char === '"' || char === "'") {
      const quote = char;
      this.pos++;
      let str = '';
      while (this.pos < this.input.length && this.input[this.pos] !== quote) {
        str += this.input[this.pos++];
      }
      if (this.pos < this.input.length) this.pos++; // skip closing quote
      return { type: 'STRING', value: str };
    }

    // Identifier / Variable name
    if (/[a-zA-Z_]/.test(char)) {
      let ident = '';
      while (this.pos < this.input.length && /[a-zA-Z0-9_]/.test(this.input[this.pos])) {
        ident += this.input[this.pos++];
      }
      return { type: 'IDENT', value: ident };
    }

    // Multi-char operators (==, !=, <=, >=)
    const twoChar = this.input.slice(this.pos, this.pos + 2);
    if (['==', '!=', '<=', '>='].includes(twoChar)) {
      this.pos += 2;
      return { type: 'OP', value: twoChar };
    }

    // Single-char operators (+, -, *, /, %, <, >)
    if (['+', '-', '*', '/', '%', '^', '<', '>'].includes(char)) {
      this.pos++;
      return { type: 'OP', value: char };
    }

    // Unknown char, skip
    this.pos++;
    return this.nextToken();
  }
}

export class SafeFormulaEvaluator {
  private currentToken!: Token;
  private tokenizer!: Tokenizer;

  public evaluate(expression: string, variables: Record<string, any> = {}): any {
    try {
      this.tokenizer = new Tokenizer(expression.trim());
      this.currentToken = this.tokenizer.nextToken();
      const result = this.parseExpression(variables);
      return result;
    } catch {
      return '';
    }
  }

  private eat(type: TokenType, value?: string): void {
    if (this.currentToken.type === type && (!value || this.currentToken.value === value)) {
      this.currentToken = this.tokenizer.nextToken();
    } else {
      throw new Error(`Unexpected token: ${this.currentToken.value}`);
    }
  }

  // Expression: Comparison operations (==, !=, <, <=, >, >=)
  private parseExpression(variables: Record<string, any>): any {
    let left = this.parseAdditive(variables);

    while (this.currentToken.type === 'OP' && ['==', '!=', '<', '<=', '>', '>='].includes(this.currentToken.value)) {
      const op = this.currentToken.value;
      this.eat('OP', op);
      const right = this.parseAdditive(variables);

      switch (op) {
        case '==':
          left = left == right;
          break;
        case '!=':
          left = left != right;
          break;
        case '<':
          left = Number(left) < Number(right);
          break;
        case '<=':
          left = Number(left) <= Number(right);
          break;
        case '>':
          left = Number(left) > Number(right);
          break;
        case '>=':
          left = Number(left) >= Number(right);
          break;
      }
    }

    return left;
  }

  // Additive: + and -
  private parseAdditive(variables: Record<string, any>): any {
    let left = this.parseMultiplicative(variables);

    while (this.currentToken.type === 'OP' && (this.currentToken.value === '+' || this.currentToken.value === '-')) {
      const op = this.currentToken.value;
      this.eat('OP', op);
      const right = this.parseMultiplicative(variables);

      if (op === '+') {
        if (typeof left === 'string' || typeof right === 'string') {
          left = String(left) + String(right);
        } else {
          left = Number(left) + Number(right);
        }
      } else {
        left = Number(left) - Number(right);
      }
    }

    return left;
  }

  // Multiplicative: *, /, %
  private parseMultiplicative(variables: Record<string, any>): any {
    let left = this.parsePrimary(variables);

    while (this.currentToken.type === 'OP' && ['*', '/', '%'].includes(this.currentToken.value)) {
      const op = this.currentToken.value;
      this.eat('OP', op);
      const right = this.parsePrimary(variables);

      if (op === '*') {
        left = Number(left) * Number(right);
      } else if (op === '/') {
        const numRight = Number(right);
        left = numRight === 0 ? 0 : Number(left) / numRight;
      } else if (op === '%') {
        left = Number(left) % Number(right);
      }
    }

    return left;
  }

  // Primary: number, string, variable, ( expression )
  private parsePrimary(variables: Record<string, any>): any {
    const token = this.currentToken;

    if (token.type === 'NUMBER') {
      this.eat('NUMBER');
      return parseFloat(token.value);
    }

    if (token.type === 'STRING') {
      this.eat('STRING');
      return token.value;
    }

    if (token.type === 'IDENT') {
      this.eat('IDENT');
      const varName = token.value;
      if (varName === 'true') return true;
      if (varName === 'false') return false;
      if (varName === 'null') return null;

      return Object.prototype.hasOwnProperty.call(variables, varName)
        ? variables[varName]
        : 0;
    }

    if (token.type === 'LPAREN') {
      this.eat('LPAREN');
      const val = this.parseExpression(variables);
      this.eat('RPAREN');
      return val;
    }

    // Unary minus
    if (token.type === 'OP' && token.value === '-') {
      this.eat('OP', '-');
      return -Number(this.parsePrimary(variables));
    }

    return 0;
  }
}

