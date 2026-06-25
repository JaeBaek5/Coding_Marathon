import OpenAI from 'openai';
import { loadLLMConfig } from './config.js';

let sharedClient = null;
let sharedConfig = null;
let harnesses = null;

const AgentDefinitions = {
  orchestrator: {
    instanceId: 'mumuk-orchestrator',
    systemPrompt: [
      'You are Orchestrator, the LLM supervisor for the Mumuk restaurant recommendation project.',
      'You own one project instance and delegate bounded tasks to Aleph, Bet, and Gimel.',
      'Return only schema-compatible decisions and never bypass deterministic tools for filtering, route math, or ranking.'
    ].join(' ')
  },
  aleph: {
    instanceId: 'mumuk-aleph',
    systemPrompt: [
      'You are Aleph, the NLU and slot validation agent for one Mumuk project instance.',
      'Extract only supported meal-planning slots from the user query, identify missing fields, and ask concise follow-up questions.',
      'Never invent a budget, location, travel mode, route time, party context, or vibe.'
    ].join(' ')
  },
  bet: {
    instanceId: 'mumuk-bet',
    systemPrompt: [
      'You are Bet, the search and deterministic tool agent for one Mumuk project instance.',
      'Use official provider/tool results for restaurant candidates and route metadata.',
      'Filtering, time math, ranking, and Top N selection must remain deterministic and schema-bound.'
    ].join(' ')
  },
  gimel: {
    instanceId: 'mumuk-gimel',
    systemPrompt: [
      'You are Gimel, the grounded recommendation reason agent for one Mumuk project instance.',
      'Use only sanitized candidate metadata and approved tool outputs.',
      'Never mention coordinates and never fabricate ratings, reviews, price, opening hours, or popularity.'
    ].join(' ')
  }
};

function assertAgentName(agentName) {
  if (!Object.hasOwn(AgentDefinitions, agentName)) {
    throw new Error(`Unknown LLM agent: ${agentName}`);
  }
}

export function getLLMClient() {
  if (!sharedConfig) {
    sharedConfig = loadLLMConfig();
  }

  if (!sharedClient) {
    sharedClient = new OpenAI({
      apiKey: sharedConfig.apiKey,
      baseURL: sharedConfig.baseURL,
      timeout: sharedConfig.timeoutMs
    });
  }

  return { client: sharedClient, config: sharedConfig };
}

export function getAgentHarness(agentName) {
  assertAgentName(agentName);

  if (!harnesses) {
    const { client, config } = getLLMClient();
    harnesses = Object.fromEntries(
      Object.entries(AgentDefinitions).map(([name, definition]) => [
        name,
        {
          name,
          instanceId: definition.instanceId,
          projectScope: 'mumuk',
          client,
          model: config.models[name],
          provider: config.provider,
          baseURL: config.baseURL,
          reasoning: config.reasoning,
          systemPrompt: definition.systemPrompt
        }
      ])
    );
  }

  return harnesses[agentName];
}

export function listAgentHarnesses() {
  return Object.keys(AgentDefinitions).map((agentName) => {
    const harness = getAgentHarness(agentName);
    return {
      name: harness.name,
      instanceId: harness.instanceId,
      projectScope: harness.projectScope,
      provider: harness.provider,
      baseURL: harness.baseURL,
      model: harness.model,
      reasoning: harness.reasoning,
      systemPrompt: harness.systemPrompt
    };
  });
}

export function getPublicHarnessConfig() {
  const agents = listAgentHarnesses().map((agent) => ({
    name: agent.name,
    instanceId: agent.instanceId,
    projectScope: agent.projectScope,
    provider: agent.provider,
    baseURL: agent.baseURL,
    model: agent.model,
    reasoning: agent.reasoning
  }));
  const firstAgent = agents[0] || null;

  if (!firstAgent) {
    return null;
  }

  return {
    provider: firstAgent.provider,
    baseURL: firstAgent.baseURL,
    model: firstAgent.model,
    agents
  };
}

export async function createAgentChatCompletion(agentName, request) {
  const harness = getAgentHarness(agentName);
  return harness.client.chat.completions.create({
    ...request,
    model: harness.model,
    messages: [
      { role: 'system', content: harness.systemPrompt },
      ...(request.messages || [])
    ],
    reasoning: harness.reasoning
  });
}

export function resetClientForTesting() {
  sharedClient = null;
  sharedConfig = null;
  harnesses = null;
}
