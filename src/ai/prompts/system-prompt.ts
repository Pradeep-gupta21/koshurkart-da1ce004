import { PromptBuilder } from './prompt-builder';
import { KOSHUR_AI_CONFIG } from '../identity/identity';
import { PromptContext, PromptMemory, PromptRAG, PromptTools } from '../core/types';

/**
 * Options for generating the Koshur AI system prompt.
 * Allows passing dynamic context and state without hardcoding.
 */
export interface SystemPromptOptions {
  context?: PromptContext;
  memory?: PromptMemory;
  rag?: PromptRAG;
  tools?: PromptTools;
}

/**
 * Generates the master system prompt for Koshur AI.
 * This function orchestrates the PromptBuilder and KOSHUR_AI_CONFIG.
 * 
 * @param options Dynamic context and configurations
 * @returns The fully constructed system prompt string
 */
export function generateSystemPrompt(options: SystemPromptOptions = {}): string {
  const builder = new PromptBuilder();

  // 1. Always inject the foundational identity first
  builder.withIdentity(KOSHUR_AI_CONFIG);

  // 2. Inject dynamic capabilities and state based on options provided
  if (options.context) {
    builder.withContext(options.context);
  }

  if (options.tools) {
    builder.withTools(options.tools);
  }

  if (options.rag) {
    builder.withRAG(options.rag);
  }

  if (options.memory) {
    builder.withMemory(options.memory);
  }

  return builder.build();
}
