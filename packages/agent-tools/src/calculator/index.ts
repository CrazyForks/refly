import { z } from 'zod/v3';
import { AgentBaseTool, AgentBaseToolset, AgentToolConstructor } from '../base';
import { ToolsetDefinition } from '@refly/openapi-schema';

export const CalculatorToolsetDefinition: ToolsetDefinition = {
  key: 'calculator',
  domain: 'https://www.calculator.net',
  labelDict: {
    en: 'Calculator',
  },
  descriptionDict: {
    en: 'A calculator that adds and subtracts two numbers together.',
  },
  tools: [
    {
      name: 'add',
      descriptionDict: {
        en: 'A calculator that adds two numbers together.',
      },
    },
    {
      name: 'subtract',
      descriptionDict: {
        en: 'A calculator that subtracts two numbers together.',
      },
    },
  ],
};

export class CalculatorAdd extends AgentBaseTool {
  name = 'add';
  toolsetKey = CalculatorToolsetDefinition.key;

  schema = z.object({
    a: z.number().describe('The first number to add'),
    b: z.number().describe('The second number to add'),
  });
  description = 'A calculator that adds two numbers together.';

  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    const res = input.a + input.b;
    return res.toString();
  }
}

export class CalculatorSubtract extends AgentBaseTool {
  name = 'subtract';
  toolsetKey = CalculatorToolsetDefinition.key;

  schema = z.object({
    a: z.number().describe('The value to subtract from'),
    b: z.number().describe('The value to subtract'),
  });
  description = 'A calculator that subtracts two numbers.';

  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    const res = input.a - input.b;
    return res.toString();
  }
}

export class CalculatorToolset extends AgentBaseToolset {
  toolsetKey = CalculatorToolsetDefinition.key;
  tools = [CalculatorAdd, CalculatorSubtract] satisfies readonly AgentToolConstructor<unknown>[];
}
