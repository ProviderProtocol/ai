type Operator = '+' | '-' | '*' | '/';

type Token =
  | { type: 'number'; value: number }
  | { type: 'operator'; value: Operator }
  | { type: 'paren'; value: '(' | ')' };

const OPERATORS: Record<Operator, { precedence: number; associativity: 'left' | 'right' }> = {
  '+': { precedence: 1, associativity: 'left' },
  '-': { precedence: 1, associativity: 'left' },
  '*': { precedence: 2, associativity: 'left' },
  '/': { precedence: 2, associativity: 'left' },
};

function isOperator(value: string): value is Operator {
  return value === '+' || value === '-' || value === '*' || value === '/';
}

function tokenize(expression: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  let expectUnary = true;

  while (i < expression.length) {
    const char = expression[i]!;

    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      i += 1;
      continue;
    }

    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char });
      i += 1;
      expectUnary = char === '(';
      continue;
    }

    if (isOperator(char)) {
      if (expectUnary && (char === '-' || char === '+')) {
        const parsed = parseNumber(expression, i);
        if (!parsed) {
          return null;
        }
        tokens.push({ type: 'number', value: parsed.value });
        i = parsed.nextIndex;
        expectUnary = false;
        continue;
      }

      tokens.push({ type: 'operator', value: char });
      i += 1;
      expectUnary = true;
      continue;
    }

    const parsed = parseNumber(expression, i);
    if (!parsed) {
      return null;
    }
    tokens.push({ type: 'number', value: parsed.value });
    i = parsed.nextIndex;
    expectUnary = false;
  }

  return tokens;
}

function parseNumber(
  expression: string,
  startIndex: number
): { value: number; nextIndex: number } | null {
  let i = startIndex;
  let hasDot = false;
  let sawDigit = false;

  if (expression[i] === '+' || expression[i] === '-') {
    i += 1;
  }

  while (i < expression.length) {
    const char = expression[i]!;
    if (char >= '0' && char <= '9') {
      sawDigit = true;
      i += 1;
      continue;
    }
    if (char === '.' && !hasDot) {
      hasDot = true;
      i += 1;
      continue;
    }
    break;
  }

  if (!sawDigit) {
    return null;
  }

  const raw = expression.slice(startIndex, i);
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return null;
  }

  return { value, nextIndex: i };
}

function toRpn(tokens: Token[]): Token[] | null {
  const output: Token[] = [];
  const stack: Token[] = [];

  for (const token of tokens) {
    if (token.type === 'number') {
      output.push(token);
      continue;
    }

    if (token.type === 'operator') {
      const current = OPERATORS[token.value];
      while (stack.length > 0) {
        const top = stack[stack.length - 1]!;
        if (top.type !== 'operator') {
          break;
        }
        const topOp = OPERATORS[top.value];
        const shouldPop =
          (current.associativity === 'left' && current.precedence <= topOp.precedence) ||
          (current.associativity === 'right' && current.precedence < topOp.precedence);
        if (!shouldPop) {
          break;
        }
        output.push(stack.pop()!);
      }
      stack.push(token);
      continue;
    }

    if (token.value === '(') {
      stack.push(token);
      continue;
    }

    while (stack.length > 0 && stack[stack.length - 1]!.type !== 'paren') {
      output.push(stack.pop()!);
    }
    const last = stack.pop();
    if (!last || last.type !== 'paren' || last.value !== '(') {
      return null;
    }
  }

  while (stack.length > 0) {
    const token = stack.pop()!;
    if (token.type === 'paren') {
      return null;
    }
    output.push(token);
  }

  return output;
}

function evaluateRpn(tokens: Token[]): number | null {
  const stack: number[] = [];

  for (const token of tokens) {
    if (token.type === 'number') {
      stack.push(token.value);
      continue;
    }

    if (token.type === 'operator') {
      const right = stack.pop();
      const left = stack.pop();
      if (left === undefined || right === undefined) {
        return null;
      }
      let result: number;
      switch (token.value) {
        case '+':
          result = left + right;
          break;
        case '-':
          result = left - right;
          break;
        case '*':
          result = left * right;
          break;
        case '/':
          result = left / right;
          break;
      }
      if (!Number.isFinite(result)) {
        return null;
      }
      stack.push(result);
    }
  }

  if (stack.length !== 1) {
    return null;
  }

  return stack[0]!;
}

export function safeEvaluateExpression(expression: string): number | null {
  const tokens = tokenize(expression);
  if (!tokens || tokens.length === 0) {
    return null;
  }
  const rpn = toRpn(tokens);
  if (!rpn) {
    return null;
  }
  return evaluateRpn(rpn);
}
