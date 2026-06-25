import OpenAI from 'openai';
import { loadLLMConfig, OPENROUTER_DEFAULT_MODEL } from './config.js';

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
      'Users often describe mood or body state instead of explicit meal constraints — infer food intent from that context.',
      'Extract supported meal-planning slots from the user query into the schema.',
      'Populate desiredFoods, searchKeywords, and foodPreferenceScores only when the user explicitly names foods or clear eat intent.',
      'Vague state descriptions (stress, tired, hangover without naming a dish) should leave desiredFoods null for a separate food-guess step.',
      'foodPreferenceScores: use Mumuk catalog food ids with score 0-100 (0=dislike, 50=neutral, 100=craving).',
      'Catalog includes categories: hangover, korean, meat, seafood, soup, noodle, rice, chicken, chinese, japanese, western, snack, dessert.',
      'Use ids like 해장, 삼겹살, 국밥, 짜장면 — not free-form labels.',
      'Set venuePreference explicitly:',
      '- bar: user wants to drink alcohol now (e.g. "술마시고 싶다", "맥주 한잔", "술집").',
      '- restaurant: default meals, including hangover recovery food (e.g. "어제 술마셔서 해장", "숙취에 국밥").',
      '- cafe: user wants cafe, coffee, or dessert.',
      'Critical disambiguation:',
      '- "술마시고 싶다" => venuePreference bar, searchKeywords like 술집, 호프. NOT hangover food.',
      '- "어제 술마셔서 해장" => desiredFoods ["해장"], foodPreferenceScores e.g. 해장 95, 국밥 90, 치킨 10, venuePreference restaurant. NOT bar.',
      '- "고기 먹고 싶다" => desiredFoods ["고기"], foodPreferenceScores e.g. 삼겹살 95, 고기 90, 샤브샤브 15.',
      'Never invent budget, location, coordinates, travel mode, or route time unless explicitly stated.',
      'partyContext and vibe only when clearly stated; otherwise leave null.',
      'When follow-up questions are requested separately, return concise Korean labels and tap-friendly button options with schema-valid values.'
    ].join(' ')
  },
  bet: {
    instanceId: 'mumuk-bet',
    systemPrompt: [
      'You are Bet, the search and review-scoring agent for one Mumuk project instance.',
      'Score restaurant candidates using only provided metadata and review excerpts.',
      'Relevance must reflect what the user wants to eat and the social context; sentiment must reflect review positivity.',
      'Penalize clear mismatches such as shabu/hotpot when the user wants grilled meat.'
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

function resolveCompletionModel(harness, options = {}) {
  if (options.modelOverride) {
    return options.modelOverride;
  }
  if (options.useBestModel) {
    const { config } = getLLMClient();
    return (
      config.models.aleph ||
      config.models.gimel ||
      OPENROUTER_DEFAULT_MODEL
    );
  }
  return harness.model;
}

export async function createAgentChatCompletion(agentName, request, options = {}) {
  const harness = getAgentHarness(agentName);
  const model = resolveCompletionModel(harness, options);
  const systemMessages = request.messages?.some((message) => message.role === 'system')
    ? []
    : [{ role: 'system', content: harness.systemPrompt }];

  return harness.client.chat.completions.create({
    ...request,
    model,
    messages: [...systemMessages, ...(request.messages || [])],
    reasoning: harness.reasoning
  });
}

export function resetClientForTesting() {
  sharedClient = null;
  sharedConfig = null;
  harnesses = null;
}
