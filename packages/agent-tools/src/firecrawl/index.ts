import { z } from 'zod/v3';
import { ToolParams } from '@langchain/core/tools';
import { FirecrawlClient } from './client';
import { AgentBaseTool, AgentBaseToolset, AgentToolConstructor } from '../base';
import { ToolsetDefinition } from '@refly/openapi-schema';

export const FirecrawlToolsetDefinition: ToolsetDefinition = {
  key: 'firecrawl',
  domain: 'https://firecrawl.dev',
  labelDict: {
    en: 'Firecrawl',
  },
  descriptionDict: {
    en: 'Firecrawl is a toolset for scraping and searching the web.',
  },
  tools: [
    {
      name: 'scrape',
      descriptionDict: {
        en: 'A web scraper. Useful for when you need to scrape a website.',
      },
    },
    {
      name: 'search',
      descriptionDict: {
        en: 'A search engine. Useful for when you need to answer questions about current events.',
      },
    },
  ],
  requiresAuth: true,
  authPatterns: [
    {
      type: 'credentials',
      credentialSchema: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
          },
        },
        required: ['apiKey'],
      },
    },
  ],
  configSchema: {
    type: 'object',
    properties: {
      baseUrl: {
        type: 'string',
        description: 'The base URL of the Firecrawl API',
      },
    },
  },
};

interface FirecrawlToolParams extends ToolParams {
  apiKey: string;
  baseUrl?: string;
}

export class FirecrawlScrape extends AgentBaseTool<FirecrawlToolParams> {
  name = 'scrape';
  toolsetKey = FirecrawlToolsetDefinition.key;

  schema = z.object({
    url: z.string().describe('The URL to scrape'),
  });

  description = 'A web scraper. Useful for when you need to scrape a website.';

  protected client: FirecrawlClient;

  constructor(params: FirecrawlToolParams) {
    super(params);
    this.client = new FirecrawlClient({
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
    });
  }

  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    const data = await this.client.scrape({
      url: input.url,
      formats: ['markdown'],
    });
    return data.data?.markdown ?? '';
  }
}

export class FirecrawlSearch extends AgentBaseTool<FirecrawlToolParams> {
  name = 'search';
  toolsetKey = FirecrawlToolsetDefinition.key;

  schema = z.object({
    query: z.string().describe('The search query to execute'),
    limit: z.number().describe('The number of results to return').default(5),
  });

  description =
    'A search engine. Useful for when you need to answer questions about current events.';

  protected client: FirecrawlClient;

  constructor(params: FirecrawlToolParams) {
    super(params);
    this.client = new FirecrawlClient({
      apiKey: params.apiKey,
    });
  }

  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    const data = await this.client.search({
      query: input.query,
      limit: input.limit,
    });
    return JSON.stringify(data);
  }
}

export class FirecrawlToolset extends AgentBaseToolset<FirecrawlToolParams> {
  toolsetKey = FirecrawlToolsetDefinition.key;
  tools = [
    FirecrawlScrape,
    FirecrawlSearch,
  ] satisfies readonly AgentToolConstructor<FirecrawlToolParams>[];
}
