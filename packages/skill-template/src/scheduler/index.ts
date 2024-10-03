import { AIMessageChunk, BaseMessage } from '@langchain/core/messages';
import { START, END, StateGraphArgs, StateGraph } from '@langchain/langgraph';

// schema
import { z } from 'zod';
// types
import { SystemMessage } from '@langchain/core/messages';
import { HumanMessage } from '@langchain/core/messages';
import { Runnable, RunnableConfig } from '@langchain/core/runnables';
import { BaseSkill, BaseSkillState, SkillRunnableConfig, baseStateGraphArgs } from '../base';
import { ToolMessage } from '@langchain/core/messages';
import { pick, safeParseJSON } from '@refly/utils';
import {
  Icon,
  Resource,
  Note,
  Collection,
  SkillInvocationConfig,
  SkillMeta,
  SkillTemplateConfigSchema,
  SkillContextContentItem,
  SkillContextResourceItem,
  SkillContextNoteItem,
  SkillContextCollectionItem,
} from '@refly/openapi-schema';
import { ToolCall } from '@langchain/core/dist/messages/tool';
import { randomUUID } from 'node:crypto';
import { createSkillInventory } from '../inventory';
// tools
import { ReflyDefaultResponse } from '../tools/default-response';
import { LOCALE } from '@refly/common-types';
// types
import { SkillContextContentItemMetadata, SelectedContentDomain } from './types';
interface QueryAnalysis {
  intent: 'WRITING' | 'READING_COMPREHENSION' | 'SEARCH_QA' | 'OTHER';
  confidence: number;
  reasoning: string;
  optimizedQuery: string;
  relevantContext: {
    type: 'message' | 'content' | 'resource' | 'note' | 'collection';
    id: string;
    content: string;
  }[];
}

interface IContext {
  contentList: SkillContextContentItem[];
  resources: SkillContextResourceItem[];
  notes: SkillContextNoteItem[];
  collections: SkillContextCollectionItem[];
  messages: BaseMessage[];
  locale?: string | LOCALE;
}

interface GraphState extends BaseSkillState {
  /**
   * Accumulated messages.
   */
  messages: BaseMessage[];
  /**
   * Skill calls to run.
   */
  skillCalls: ToolCall[];
  contextualUserQuery: string; // 基于上下文改写 userQuery
}

export class Scheduler extends BaseSkill {
  name = 'scheduler';

  displayName = {
    en: 'Knowledge Curator',
    'zh-CN': '知识管家',
  };

  icon: Icon = { type: 'emoji', value: '🧙‍♂️' };

  configSchema: SkillTemplateConfigSchema = {
    items: [],
  };

  invocationConfig: SkillInvocationConfig = {};

  description = "Inference user's intent and run related skill";

  schema = z.object({
    query: z.string().optional().describe('The search query'),
  });

  graphState: StateGraphArgs<GraphState>['channels'] = {
    ...baseStateGraphArgs,
    messages: {
      reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
      default: () => [],
    },
    skillCalls: {
      reducer: (x: ToolCall[], y: ToolCall[]) => y, // always update with newer value
      default: () => [],
    },
    contextualUserQuery: {
      reducer: (left?: string, right?: string) => (right ? right : left || ''),
      default: () => '',
    },
  };

  // Default skills to be scheduled (they are actually templates!).
  skills: BaseSkill[] = createSkillInventory(this.engine);

  // Scheduler config snapshot, should keep unchanged except for `spanId`.
  configSnapshot?: SkillRunnableConfig;

  isValidSkillName = (name: string) => {
    return this.skills.some((skill) => skill.name === name);
  };

  directCallSkill = async (state: GraphState, config: SkillRunnableConfig): Promise<Partial<GraphState>> => {
    const { selectedSkill, installedSkills } = config.configurable || {};

    const skillInstance = installedSkills.find((skill) => skill.skillId === selectedSkill.skillId);
    if (!skillInstance) {
      throw new Error(`Skill ${selectedSkill.tplName} not installed.`);
    }

    const skillTemplate = this.skills.find((tool) => tool.name === selectedSkill.tplName);
    if (!skillTemplate) {
      throw new Error(`Skill ${selectedSkill} not found.`);
    }

    const skillConfig: SkillRunnableConfig = {
      ...config,
      configurable: {
        ...config.configurable,
        currentSkill: skillInstance,
      },
    };

    this.emitEvent({ event: 'start' }, skillConfig);
    const output = await skillTemplate.invoke({ query: state.query }, skillConfig);

    // We'll send end event in genRelatedQuestions node.
    // So don't send it here.

    const message = new AIMessageChunk({
      name: skillTemplate.name,
      content: typeof output === 'string' ? output : JSON.stringify(output),
    });

    return { messages: [message] };
  };

  genToolMsgSummarization = async (needSummarizedContent: string) => {
    const getSystemPrompt = (
      needSummarizedContent: string,
    ) => `You will be provided with a result generated by a tool. Your task is to summarize the most essential information from these results. The summary should include all key points and be no more than 100 words.

Tool results are provided within triple quotes.
"""
${needSummarizedContent}
"""

Summary requirements:
1. The summary must include all key points;
2. Important: The word limit is **100 words**.

After completing the summary, please provide suggestions for the next decision-making steps.

Example tool results:
"""
- The key is on the table.
- The door lock is broken and needs a technician to repair it.
- The living room light isn't working, possibly due to a faulty bulb.
- Schedule a repair for the door lock and bulb replacement as soon as possible.
"""

Example summary:
"""
The key is on the table. The door lock is broken and requires a technician. The living room bulb is faulty and needs replacement. Schedule the repairs and bulb replacement promptly.
"""

Please generate the summary based on these requirements and offer suggestions for the next steps.
  `;

    const model = this.engine.chatModel({ temperature: 0.1, maxTokens: 100 });

    const runnable = model.withStructuredOutput(
      z
        .object({
          summary: z.string(),
        })
        .describe(`Generate the summary based on these requirements and offer suggestions for the next steps.`),
    );
    const summaryModelRes = await runnable.invoke([new HumanMessage(getSystemPrompt(needSummarizedContent))]);

    return summaryModelRes?.summary || '';
  };

  getToolMsg = async (currentSkill: SkillMeta, query: string, realOutput: { messages: BaseMessage[] }) => {
    let realToolOutputMsg: ToolMessage;

    let toolSuccessMsgTemplate = `The **${currentSkill.tplName}** tool is already completed the task based on given user query: **${query}**.
    ## Tool result
      Tool result are provided within triple quotes.
      """
      {{toolResult}}
      """ 
    ## Note
    - The result is **already send to user**. 
    - Please evaluate whether the user's request has been fully satisfied. If further actions are needed, determine the next appropriate tool to call; otherwise, terminate the response.`;
    const toolFailedMsgTemplate = `The **${currentSkill.tplName}** tool call without any content, please check whether need call new tool or stop response`;

    // handle summarize for tool operator
    if (realOutput?.messages?.length > 0) {
      const lastMsg = realOutput.messages[realOutput.messages.length - 1];
      let realToolOutputMsgContent = '';

      if (lastMsg?.content?.length > 0) {
        const summarizedToolMsg = await this.genToolMsgSummarization(
          typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content),
        );
        realToolOutputMsgContent = toolSuccessMsgTemplate.replace('{{toolResult}}', summarizedToolMsg);
      } else {
        realToolOutputMsgContent = toolFailedMsgTemplate;
      }

      realToolOutputMsg = new ToolMessage({
        name: currentSkill.tplName,
        content: realToolOutputMsgContent,
        tool_call_id: currentSkill?.skillId!,
      });
    } else {
      realToolOutputMsg = new ToolMessage({
        name: currentSkill.tplName,
        content: toolFailedMsgTemplate,
        tool_call_id: currentSkill?.skillId!,
      });
    }

    return realToolOutputMsg;
  };

  private summarizeContext(context: IContext): string {
    const { contentList, resources, notes, collections, messages } = context;

    const summarizeResources = (resources: SkillContextResourceItem[]) =>
      resources
        .map((r) => `- ${r.resource.resourceType}: "${r.resource.title}" (ID: ${r.resource.resourceId})`)
        .join('\n');

    const summarizeNotes = (notes: SkillContextNoteItem[]) =>
      notes.map((n) => `- Note: "${n.note.title}" (ID: ${n.note.noteId})`).join('\n');

    const summarizeCollections = (collections: SkillContextCollectionItem[]) =>
      collections.map((c) => `- Collection: "${c.collection.title}" (ID: ${c.collection.collectionId})`).join('\n');

    const summarizeMessages = (messages: BaseMessage[]) =>
      messages.map((m) => `- ${m._getType()}: ${(m.content as string)?.substring(0, 50)}...`).join('\n');

    return `Content List:
  ${contentList.map((c, i) => `- Content ${i + 1}: ${c.content.substring(0, 50)}...`).join('\n')}
  
  Resources:
  ${summarizeResources(resources)}
  
  Notes:
  ${summarizeNotes(notes)}
  
  Collections:
  ${summarizeCollections(collections)}
  
  Recent Messages:
  ${summarizeMessages(messages.slice(-5))}`;
  }

  private summarizeChatHistory(chatHistory: BaseMessage[]): string {
    // Take the last 5 messages for context
    const recentMessages = chatHistory.slice(-5);
    return recentMessages.map((msg) => `${msg._getType()}: ${(msg.content as string)?.substring(0, 50)}...`).join('\n');
  }

  // private countTokens(text: string): number {
  //   return this.engine.countTokens(text);
  // }

  private async analyzeQueryAndContext(query: string, context: IContext): Promise<Array<QueryAnalysis>> {
    const { contentList, resources, notes, collections, messages, locale } = context;

    this.emitEvent({ event: 'log', content: 'Analyzing query and context...' }, this.configSnapshot);

    const getSystemPrompt =
      () => `You are an advanced AI assistant specializing in query analysis, intent recognition, and context extraction. Analyze the given query and context to determine the user's atomic intents, optimize the query into atomic queries, and extract relevant context.
  
  Possible intents:
  1. SEARCH_QA: The user is asking a question that requires searching through given context or explicitly requests online search.
  2. WRITING: The user wants help with writing tasks such as composing emails, blog posts, optimizing expressions, continuing text, or summarizing.
  3. READING_COMPREHENSION: The user needs help understanding, summarizing, explaining, or translating given text.
  4. OTHER: The user's intent doesn't fit into the above categories.
  
  Guidelines:
  1. Analyze the query and all provided context carefully.
  2. Break down the query into atomic intents, where each intent corresponds to a single task or question.
  3. For each atomic intent, provide an optimized query that focuses solely on that intent.
  4. Extract the most relevant context items for each atomic intent.
  5. Provide a confidence score and reasoning for each identified intent.
  6. Consider the chat history and available context when analyzing the query.
  
  User's locale: ${locale}
  
  Here are some examples to illustrate the expected output:
  
  Example 1:
  Original Query: "Can you summarize the article about climate change and then help me write an email about its key points?"
  Output:
  {
    "analysis": [
      {
        "intent": "READING_COMPREHENSION",
        "confidence": 0.9,
        "reasoning": "The user explicitly asks for a summary of an article.",
        "optimizedQuery": "Summarize the article about climate change",
        "relevantContext": [
          {
            "type": "resource",
            "id": "climate_change_article_id",
            "content": "Article about climate change impacts and mitigation strategies"
          }
        ]
      },
      {
        "intent": "WRITING",
        "confidence": 0.85,
        "reasoning": "The user requests help in writing an email based on the summary.",
        "optimizedQuery": "Write an email about the key points of the climate change article summary",
        "relevantContext": []
      }
    ]
  }
  
  Example 2:
  Original Query: "What are the main characters in 'To Kill a Mockingbird' and can you help me write a short essay about the theme of racial injustice in the book?"
  Output:
  {
    "analysis": [
      {
        "intent": "SEARCH_QA",
        "confidence": 0.95,
        "reasoning": "The user is asking for specific information about the book's characters.",
        "optimizedQuery": "What are the main characters in 'To Kill a Mockingbird'?",
        "relevantContext": [
          {
            "type": "resource",
            "id": "to_kill_a_mockingbird_book_id",
            "content": "Novel 'To Kill a Mockingbird' by Harper Lee"
          }
        ]
      },
      {
        "intent": "WRITING",
        "confidence": 0.9,
        "reasoning": "The user requests assistance in writing an essay about a specific theme in the book.",
        "optimizedQuery": "Write a short essay about the theme of racial injustice in 'To Kill a Mockingbird'",
        "relevantContext": [
          {
            "type": "resource",
            "id": "to_kill_a_mockingbird_book_id",
            "content": "Novel 'To Kill a Mockingbird' by Harper Lee"
          }
        ]
      }
    ]
  }
  
  Output your response in the following JSON format:
  {
    "analysis": [
      {
        "intent": "SEARCH_QA | WRITING | READING_COMPREHENSION | OTHER",
        "confidence": 0.0 to 1.0,
        "reasoning": "A brief explanation of your reasoning",
        "optimizedQuery": "An atomic, optimized version of the original query",
        "relevantContext": [
          {
            "type": "content | resource | note | collection | message",
            "id": "ID of the relevant context item",
            "content": "Brief summary or extract of the relevant content"
          }
        ]
      }
    ]
  }`;

    const getUserMessage = () => `Query: ${query}
  
  Context Summary:
  ${this.summarizeContext({ contentList, resources, notes, collections, messages, locale })}
  
  Please analyze the query and context to determine the user's intent, optimize the query, and extract relevant context.`;

    const model = this.engine.chatModel({ temperature: 0.1 });
    const runnable = model.withStructuredOutput(
      z.object({
        analysis: z.array(
          z.object({
            intent: z.enum(['SEARCH_QA', 'WRITING', 'READING_COMPREHENSION', 'OTHER']),
            confidence: z.number().min(0).max(1),
            reasoning: z.string(),
            optimizedQuery: z.string(),
            relevantContext: z.array(
              z.object({
                type: z.enum(['content', 'resource', 'note', 'collection', 'message']),
                id: z.string(),
                content: z.string(),
              }),
            ),
          }),
        ),
      }),
    );

    const result = await runnable.invoke([new SystemMessage(getSystemPrompt()), new HumanMessage(getUserMessage())]);

    result.analysis.forEach((item, index) => {
      this.engine.logger.log(`Analysis ${index + 1}:`);
      this.engine.logger.log(`Intent: ${item.intent} (confidence: ${item.confidence})`);
      this.engine.logger.log(`Reasoning: ${item.reasoning}`);
      this.engine.logger.log(`Optimized Query: ${item.optimizedQuery}`);
      this.engine.logger.log(`Relevant Context: ${JSON.stringify(item.relevantContext)}`);

      this.emitEvent({ event: 'log', content: `Analysis ${index + 1}:` }, this.configSnapshot);
      this.emitEvent(
        { event: 'log', content: `Intent: ${item.intent} (confidence: ${item.confidence})` },
        this.configSnapshot,
      );
      this.emitEvent({ event: 'log', content: `Reasoning: ${item.reasoning}` }, this.configSnapshot);
      this.emitEvent({ event: 'log', content: `Optimized Query: ${item.optimizedQuery}` }, this.configSnapshot);
      this.emitEvent(
        { event: 'log', content: `Relevant Context: ${JSON.stringify(item.relevantContext)}` },
        this.configSnapshot,
      );
    });

    return result.analysis as QueryAnalysis[];
  }

  private async extractRelevantContext(
    messages: BaseMessage[],
    context: {
      contentList: string[];
      resources: Resource[];
      notes: Note[];
      collections: Collection[];
    },
    intents: Array<{
      intent: string;
      confidence: number;
      reasoning: string;
    }>,
  ): Promise<string> {
    // Implement context extraction and compression logic
    /**
     * 1. 基于给定的聊天历史、上下文（contentList <string[]>、resources <Resource[]>、notes <Note[]>、collections <Collection[]>），还有当前的意图识别结果，提取出最相关的上下文
     * 2. 上下文在提取过程中可能涉及到向量相似度匹配，上下文裁剪或压缩等
     * 3. 根据模型的 token 窗口进行上下文提取，确保不会超出模型的 token 窗口同时是最相关的上下文
     * 3. 撰写 Prompt，调用 LLM
     */
    const { contentList, resources, notes, collections } = context;

    this.emitEvent({ event: 'log', content: 'Extracting relevant context...' }, this.configSnapshot);

    const getSystemPrompt =
      () => `You are an advanced AI assistant specializing in extracting relevant context for user queries. Your task is to analyze the given chat history, available context, and recognized intents to determine the most relevant information for answering the user's query.
  
  Guidelines:
  1. Analyze the chat history to understand the context of the conversation.
  2. Consider the recognized intents and their confidence scores when selecting relevant context.
  3. Prioritize recent and highly relevant information from the available context.
  4. Select a diverse range of context types (content, resources, notes, collections) if applicable.
  5. Limit the extracted context to the most relevant items to avoid information overload.
  6. If the available context doesn't seem relevant to the query, indicate that no relevant context was found.
  
  Output your response in the following JSON format:
  {
    "relevantContext": [
      {
        "type": "content | resource | note | collection",
        "id": "ID of the relevant item (if applicable)",
        "content": "Extracted relevant content or summary",
        "relevance": 0.0 to 1.0
      }
    ],
    "reasoning": "A brief explanation of your context selection"
  }`;

    const getUserMessage = () => `Chat History:
  ${this.summarizeChatHistory(messages)}
  
  Recognized Intents:
  ${intents.map((intent) => `- ${intent.intent} (confidence: ${intent.confidence})`).join('\n')}
  
  Available Context:
  - Content List: ${contentList.length} items
  - Resources: ${resources.length} items
  - Notes: ${notes.length} items
  - Collections: ${collections.length} items
  
  Please extract the most relevant context for answering the user's query.`;

    const model = this.engine.chatModel({ temperature: 0.3 });
    const runnable = model.withStructuredOutput(
      z.object({
        relevantContext: z.array(
          z.object({
            type: z.enum(['content', 'resource', 'note', 'collection']),
            id: z.string().optional(),
            content: z.string(),
            relevance: z.number().min(0).max(1),
          }),
        ),
        reasoning: z.string(),
      }),
    );

    const result = await runnable.invoke([new SystemMessage(getSystemPrompt()), new HumanMessage(getUserMessage())]);

    this.engine.logger.log(`Extracted ${result.relevantContext.length} relevant context items`);
    this.engine.logger.log(`Context extraction reasoning: ${result.reasoning}`);

    // Format the extracted context
    const formattedContext = result.relevantContext
      .map((item) => `[${item.type.toUpperCase()}${item.id ? ` ${item.id}` : ''}] ${item.content}`)
      .join('\n\n');

    return formattedContext;
  }

  private async writeSkill() {
    /**
     * 1. 基于
     */
  }

  private async readSkill() {}

  private async qaSkill() {}

  private async otherIntentSkill() {}

  /**
   * Call the first scheduled skill within the state.
   */
  callSkill = async (state: GraphState, config: SkillRunnableConfig): Promise<Partial<GraphState>> => {
    const { skillCalls, query, contextualUserQuery } = state;
    if (!skillCalls) {
      this.emitEvent({ event: 'log', content: 'No skill calls to proceed.' }, config);
      return {};
    }

    const { locale = 'en' } = config.configurable || {};

    // Pick the first skill to call
    const call = state.skillCalls[0];

    // We'll first try to use installed skill instance, if not found then fallback to skill template
    const { installedSkills = [] } = config.configurable || {};
    const skillInstance = installedSkills.find((skill) => skill.tplName === call.name);
    const skillTemplate = this.skills.find((skill) => skill.name === call.name);
    const currentSkill: SkillMeta = skillInstance ?? {
      tplName: skillTemplate.name,
      displayName: skillTemplate.displayName[locale],
      icon: skillTemplate.icon,
    };
    const skillConfig: SkillRunnableConfig = {
      ...config,
      configurable: {
        ...config.configurable,
        currentSkill,
        spanId: randomUUID(), // generate new spanId for each managed skill call
      },
    };

    this.emitEvent({ event: 'start' }, skillConfig);

    // Dequeue the first skill call from the state
    let result: Partial<GraphState> = {
      skillCalls: state.skillCalls.slice(1),
    };

    try {
      const output = await skillTemplate.invoke(call.args, skillConfig);
      const realOutput: { messages: BaseMessage[] } = typeof output === 'string' ? safeParseJSON(output) : output;
      const realToolOutputMsg = await this.getToolMsg(
        {
          tplName: currentSkill.tplName,
          skillId: call?.id,
          displayName: currentSkill.displayName,
          icon: currentSkill.icon,
        },
        contextualUserQuery || query,
        realOutput,
      );

      result = { messages: [realToolOutputMsg] };
    } catch (error) {
      this.engine.logger.error(`Error calling skill ${currentSkill.tplName}: ${error.stack}`);
    } finally {
      this.emitEvent({ event: 'end' }, skillConfig);
    }

    return result;
  };

  private concatContext = () => {
    const {
      locale = 'en',
      chatHistory = [],
      contentList,
      resources,
      notes,
      collections,
    } = this.configSnapshot.configurable;

    let context = '';

    if (contentList.length > 0) {
      context += 'Following are the user selected content: \n';
      const concatContent = (
        content: string,
        from: SelectedContentDomain,
        title: string,
        id?: string,
        url?: string,
      ) => {
        return `<UserSelectedContent from={${from}} ${id ? `entityId={${id}}` : ''} title={${title}} ${
          url ? `weblinkUrl={${url}}` : ''
        }>${content}</UserSelectedContent>`;
      };

      context += contentList.map((c) => {
        const { metadata } = c;
        const { domain, entityId, title, url } = metadata as any as SkillContextContentItemMetadata;
        return concatContent(c?.content, domain as SelectedContentDomain, title, entityId, url);
      });

      context += '\n\n';
    }

    if (resources.length > 0) {
      context += 'Following are the knowledge base resources: \n';
      const concatResource = (id: string, title: string, content: string) => {
        return `<KnowledgeBaseResource entityId={${id}} title={${title}}>${content}</KnowledgeBaseResource>`;
      };

      context += resources
        .map((r) => concatResource(r.resource?.resourceId, r.resource?.title, r.resource?.content))
        .join('\n');

      context += '\n\n';
    }

    if (notes.length > 0) {
      context += 'Following are the knowledge base notes: \n';
      const concatNote = (id: string, title: string, content: string) => {
        return `<KnowledgeBaseNote entityId={${id}} title={${title}}>${content}</KnowledgeBaseNote>`;
      };

      context += notes.map((n) => concatNote(n.note?.noteId, n.note?.title, n.note?.content)).join('\n');
    }

    if (context?.length > 0) {
      context = `<Context>${context}</Context>`;
    }

    return context;
  };

  private buildSchedulerSystemPrompt = () => {
    const { locale = 'en' } = this.configSnapshot.configurable;

    const systemPrompt = `You are an advanced AI assistant developed by Refly, specializing in knowledge management, reading comprehension, writing assistance, and answering questions related to knowledge management. Your core mission is to help users effectively manage, understand, and utilize information.
  
  Role and Capabilities:
  1. Knowledge Management Expert: You excel at organizing, interpreting, and retrieving information from various sources.
  2. Reading Assistant: You can analyze and summarize complex texts, helping users grasp key concepts quickly.
  3. Writing Aid: You offer guidance and suggestions to improve users' writing, from structure to style.
  4. Question Answering System: You provide accurate and relevant answers to users' queries, drawing from given context and your broad knowledge base.
  
  Context Handling:
  You will be provided with context in XML format. This context may include user-selected content, knowledge base resources, and notes. Always consider this context when formulating your responses. The context will be structured as follows:
  
  <Context>
    <UserSelectedContent from={domain} entityId={id} title={title} weblinkUrl={url}>content</UserSelectedContent>
    <KnowledgeBaseResource entityId={id} title={title}>content</KnowledgeBaseResource>
    <KnowledgeBaseNote entityId={id} title={title}>content</KnowledgeBaseNote>
  </Context>
  
  Task:
  1. Carefully analyze the user's query, the provided context, and the conversation history.
  2. Identify the user's intent and the most relevant information from the context.
  3. Formulate a comprehensive and coherent response that directly addresses the user's needs.
  4. If the query requires multiple steps or involves complex information, break down your response into clear, logical sections.
  5. When appropriate, suggest related topics or follow-up questions that might be of interest to the user.
  
  Guidelines:
  1. Always maintain a professional, helpful, and friendly tone.
  2. Provide accurate information and cite sources from the given context when applicable.
  3. If you're unsure about something or if the required information is not in the context, clearly state this and offer to find more information if needed.
  4. Respect user privacy and confidentiality. Do not ask for or disclose personal information.
  5. Adapt your language complexity to match the user's level of expertise as inferred from their query and the conversation history.
  6. Responses should be in the user's preferred language (${locale}), but maintain technical terms in their original language when appropriate.
  
  Remember, your goal is to be a knowledgeable, efficient, and user-friendly assistant in all matters related to knowledge management and information processing. Always strive to provide value and enhance the user's understanding of their query and related topics.`;

    return systemPrompt;
  };

  callScheduler = async (state: GraphState, config: SkillRunnableConfig): Promise<Partial<GraphState>> => {
    /**
     * 1. 基于聊天历史，当前意图识别结果，上下文，以及整体优化之后的 query，调用 scheduler 模型，得到一个最优的技能调用序列
     * 2. 基于得到的技能调用序列，调用相应的技能
     */

    this.configSnapshot ??= config;
    this.emitEvent({ event: 'start' }, this.configSnapshot);

    const { messages = [], query, contextualUserQuery } = state;
    const { locale = 'en', chatHistory = [], installedSkills, currentSkill, spanId } = this.configSnapshot.configurable;

    const context = this.concatContext();
    const systemPrompt = this.buildSchedulerSystemPrompt();

    const model = this.engine.chatModel({ temperature: 0.1 });

    const responseMessage = await model.invoke(
      [
        new SystemMessage(systemPrompt),
        ...chatHistory.slice(0, -1),
        ...messages,
        new HumanMessage(`The context is ${context}`),
        new HumanMessage(`The user's query is ${query}`),
      ],
      {
        ...this.configSnapshot,
        metadata: {
          ...this.configSnapshot.metadata,
          ...currentSkill,
          spanId,
        },
      },
    );

    this.emitEvent({ event: 'end' }, this.configSnapshot);

    return { messages: [responseMessage], skillCalls: [] };
  };

  commonSenseGenerate = async (
    state: GraphState,
    config: SkillRunnableConfig,
    callByGraph = true,
  ): Promise<Partial<GraphState>> => {
    const { messages = [], query, contextualUserQuery } = state;

    this.configSnapshot ??= config;

    // default by langgraph engine call, but can be called as function
    if (callByGraph) {
      this.emitEvent({ event: 'start' }, this.configSnapshot);
    }

    const {
      contentList = [],
      locale = 'en',
      chatHistory = [],
      currentSkill,
      spanId,
    } = this.configSnapshot.configurable; // scheduler only handle contentList when no skill could

    // without any skill, scheduler can handle contentList for common knowledge q & a
    const getSystemPrompt = (locale: string) => `- Role: Knowledge Management Assistant
- Background: Users require an intelligent assistant capable of understanding queries and context information, even when the context is absent, to provide answers in the language of the query while maintaining the language of professional terms.
- Profile: You are an AI developed by Refly AI, specializing in knowledge management, adept at reading, writing, and integrating knowledge, and skilled in providing responses in the language of the user's query.
- Skills: You possess capabilities in text parsing, information extraction, knowledge association, intelligent Q&A, and the ability to generate context from a query when necessary.
- Goals: Provide accurate, relevant, and helpful answers based on the user's query and available context information, ensuring that the language of the response matches the query and that professional terms are maintained in their original language.
- Constrains:
  1. Always respond in the language of the user's query, the user's locale is ${locale}.
  2. Maintain professional terms in their original language within the response.
  3. Ensure the response is clear and understandable, even with the inclusion of professional terms.
- OutputFormat: Clear, accurate, and helpful text responses in the query's language, with professional terms in their original language.
- Workflow:
  1. Receive the user's query and any provided context information.
  2. Analyze the query and context information, or generate context if necessary, to extract key points.
  3. Generate accurate and relevant answers, ensuring the response language matches the query and professional terms are in their original language.
- Examples:
  - Example 1: Query: "What is artificial intelligence?" Context: ["Artificial intelligence is a technology that simulates human intelligence", "Artificial intelligence can perform a variety of tasks"]
    Answer: "Artificial intelligence is a technology that simulates human intelligence and can perform a variety of tasks, such as recognizing language and solving problems."
  - Example 2: Query: "How to improve work efficiency?" Context: ["Using tools can improve work efficiency", "Proper time planning is also important"]
    Answer: "Improving work efficiency can be achieved by using appropriate tools and proper time planning."
  - Example 3: Query: "Define sustainability" Context: []
    Answer: "Sustainability refers to the ability to maintain a certain process or state without depleting resources or causing long-term harm to the environment, economy, or society."
- Initialization: In the first conversation, please directly output the following: Hello, I am your Knowledge Management Assistant. I can help you answer queries and provide answers based on context information, even if the context is not provided. My responses will always be in the language of your query, and I will maintain the original language of professional terms. Please tell me your query and any relevant context information you have.
  `;
    const getUserPrompt = (query: string, contentList: string[]) => {
      return `Query: ${contextualUserQuery || query} \n\n Context: [${contentList.filter((item) => item).join(', ')}]`;
    };

    const model = this.engine.chatModel({ temperature: 0.5 });

    const responseMessage = await model.invoke(
      [
        new SystemMessage(getSystemPrompt(locale)),
        ...chatHistory,
        ...messages,
        new HumanMessage(
          getUserPrompt(
            query,
            contentList.map((item) => item.content),
          ),
        ),
      ],
      {
        ...this.configSnapshot,
        metadata: {
          ...this.configSnapshot.metadata,
          ...currentSkill,
          spanId,
        },
      },
    );

    return { messages: [responseMessage], skillCalls: [] };
  };

  genRelatedQuestions = async (state: GraphState, config: SkillRunnableConfig) => {
    const { messages = [] } = state;
    const { locale = 'en', selectedSkill } = config.configurable || {};

    const skillConfig = selectedSkill
      ? {
          ...config,
          configurable: {
            ...config.configurable,
            currentSkill: selectedSkill,
          },
        }
      : this.configSnapshot;

    const getSystemPrompt = (locale: string) => `## Role
You are an SEO (Search Engine Optimization) expert, skilled at identifying key information from the provided context and proposing three semantically relevant recommended questions based on this information to help users gain a deeper understanding of the content.

## Skills

### Skill 1: Context Identification
- Understand and analyze the given context to determine key information.

### Skill 2: Recommending Questions
- Propose three questions that best fit the context's semantics based on key information, to assist users in better understanding the content.
- Format example:
=====
   - ❓ Recommended Question 1: <Question 1>
   - ❓ Recommended Question 2: <Question 2>
   - ❓ Recommended Question 3: <Question 3>
=====

## Emphasis

- Questions should be **short, concise, and contextual**

Generated question example:

- What are some common English phrases used in button copy for internet products?
- How can I write effective button copy in English for my internet product?
- What are some best practices for writing button copy in English for internet products?

> Up is only for examples, please output related questions in locale: ${locale} language

## Limitations:
- Only propose questions and answers related to the context.
- Strictly adhere to the provided output format.
- Always provide answers that match the user's query.
- Begin the answer directly with the optimized prompt.
  `;

    const model = this.engine.chatModel({ temperature: 0.1 });

    const runnable = model.withStructuredOutput(
      z
        .object({
          recommend_ask_followup_question: z
            .array(z.string())
            .describe(`Generate three recommended follow-up questions in locale: ${locale} language`),
        })
        .describe(
          `Understand and analyze the provided context to identify key information, and based on this ` +
            `key information, formulate three questions that best align with the context's semantics ` +
            `to assist users in gaining a better understanding of the content.`,
        ),
    );

    try {
      const askFollowUpQuestion = await runnable.invoke([
        new SystemMessage(getSystemPrompt(locale)),
        ...messages,
        new HumanMessage(`Please output answer in ${locale} language:`),
      ]);

      const followUps = askFollowUpQuestion?.recommend_ask_followup_question || [];

      this.emitEvent(
        {
          event: 'structured_data',
          content: JSON.stringify(followUps),
          structuredDataKey: 'relatedQuestions',
        },
        skillConfig,
      );
    } catch (error) {
      // Models can sometimes fail to return structured data, so we just log it and do nothing
      this.engine.logger.error(`Error generating related questions: ${error.stack}`);
    } finally {
      this.emitEvent({ event: 'end' }, skillConfig);
    }

    return {};
  };

  shouldDirectCallSkill = (
    state: GraphState,
    config: SkillRunnableConfig,
  ): 'direct' | 'scheduler' | 'commonSenseGenerate' => {
    const { selectedSkill, installedSkills = [] } = config.configurable || {};

    if (!selectedSkill) {
      return 'scheduler';
    }

    if (!this.isValidSkillName(selectedSkill.tplName)) {
      this.emitEvent(
        {
          event: 'log',
          content: `Selected skill ${selectedSkill.tplName} not found. Fallback to scheduler.`,
        },
        config,
      );
      return 'scheduler';
    }

    return 'direct';
  };

  shouldCallSkill = (state: GraphState, config: SkillRunnableConfig): 'skill' | 'relatedQuestions' | typeof END => {
    // const { skillCalls = [] } = state;
    const { convId } = this.configSnapshot?.configurable ?? config.configurable;

    // if (skillCalls.length > 0) {
    //   return 'skill';
    // }

    // If there is no skill call, then jump to relatedQuestions node
    return convId ? 'relatedQuestions' : END;
  };

  onDirectSkillCallFinish = (state: GraphState, config: SkillRunnableConfig): 'relatedQuestions' | typeof END => {
    const { convId } = config.configurable || {};

    // Only generate related questions in a conversation
    return convId ? 'relatedQuestions' : END;
  };

  onSkillCallFinish(state: GraphState, config: SkillRunnableConfig): 'scheduler' | 'skill' {
    const { skillCalls } = state;

    // Still have skill calls to run
    if (skillCalls.length > 0) {
      return 'skill';
    }

    // All skill calls are finished, so we can return to the scheduler
    return 'scheduler';
  }

  toRunnable(): Runnable<any, any, RunnableConfig> {
    const workflow = new StateGraph<GraphState>({
      channels: this.graphState,
    })
      .addNode('direct', this.directCallSkill)
      .addNode('scheduler', this.callScheduler)
      .addNode('commonSenseGenerate', this.commonSenseGenerate)
      .addNode('skill', this.callSkill)
      .addNode('relatedQuestions', this.genRelatedQuestions);

    workflow.addConditionalEdges(START, this.shouldDirectCallSkill);
    workflow.addConditionalEdges('direct', this.onDirectSkillCallFinish);
    workflow.addConditionalEdges('commonSenseGenerate', this.onDirectSkillCallFinish);
    workflow.addConditionalEdges('scheduler', this.shouldCallSkill);
    workflow.addConditionalEdges('skill', this.onSkillCallFinish);
    workflow.addEdge('relatedQuestions', END);

    return workflow.compile();
  }
}
