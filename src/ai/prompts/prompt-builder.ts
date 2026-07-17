import { AIIdentityConfig, PromptContext, PromptMemory, PromptRAG, PromptTools } from '../core/types';

/**
 * A builder class for dynamically constructing scalable and modular system prompts.
 * This prevents hardcoding monolithic prompt strings in components.
 */
export class PromptBuilder {
  private parts: string[] = [];
  
  constructor() {
    this.parts = [];
  }

  /**
   * Injects the foundational identity, personality, and guardrails.
   */
  public withIdentity(config: AIIdentityConfig): this {
    const identitySection = `
# SYSTEM IDENTITY
You are ${config.identity.name}, ${config.identity.role}
Mission: ${config.identity.mission}

## PERSONALITY & TONE
Traits: ${config.identity.traits.join(', ')}
Tone: ${config.personality.tone}
Style: ${config.personality.style}

Communication Rules:
${config.personality.communication.map(c => `- ${c}`).join('\n')}

## GUARDRAILS
- Identity: ${config.guardrails.identityProtection}
- Information Integrity: ${config.guardrails.informationIntegrity}
- Epistemic Humility: ${config.guardrails.epistemicHumility}
- Tone: ${config.guardrails.toneAndEngagement}

## OPERATIONAL CONSTRAINTS
- Financial: ${config.constraints.financial}
- Infrastructure: ${config.constraints.infrastructure}
- Policy: ${config.constraints.policy}
- Outbound: ${config.constraints.outbound}
- Cultural: ${config.constraints.cultural}
`;
    this.parts.push(identitySection.trim());
    return this;
  }

  /**
   * Injects real-time application context (e.g., cart state, user profile).
   */
  public withContext(context: PromptContext): this {
    if (Object.keys(context).length === 0) return this;
    
    let contextSection = `# CURRENT CONTEXT\n`;
    if (context.currentTime) contextSection += `Time: ${context.currentTime}\n`;
    if (context.userId) contextSection += `User ID: ${context.userId}\n`;
    
    // Extensible logic for other context keys
    const otherKeys = Object.keys(context).filter(k => !['currentTime', 'userId'].includes(k));
    if (otherKeys.length > 0) {
      contextSection += `State Context: ${JSON.stringify(Object.fromEntries(otherKeys.map(k => [k, context[k]])), null, 2)}\n`;
    }
    
    this.parts.push(contextSection.trim());
    return this;
  }

  /**
   * Injects conversational memory summaries or history if applicable.
   */
  public withMemory(memory: PromptMemory): this {
    if (!memory.summary && (!memory.history || memory.history.length === 0)) return this;
    
    let memorySection = `# MEMORY & HISTORY\n`;
    if (memory.summary) memorySection += `Summary: ${memory.summary}\n`;
    
    this.parts.push(memorySection.trim());
    return this;
  }

  /**
   * Injects Retrieval-Augmented Generation (RAG) context.
   */
  public withRAG(rag: PromptRAG): this {
    if (!rag.documents || rag.documents.length === 0) return this;
    
    let ragSection = `# KNOWLEDGE BASE (RAG)\n`;
    rag.documents.forEach(doc => {
      ragSection += `\n--- Document: ${doc.title} ---\n${doc.content}\n`;
    });
    
    this.parts.push(ragSection.trim());
    return this;
  }

  /**
   * Injects available tools and instructions on how to use them.
   */
  public withTools(tools: PromptTools): this {
    if (!tools.availableTools || tools.availableTools.length === 0) return this;
    
    let toolsSection = `# AVAILABLE TOOLS\nYou have access to the following tools to execute workflows:\n`;
    tools.availableTools.forEach(tool => {
      toolsSection += `- ${tool.name}: ${tool.description}\n`;
    });
    
    this.parts.push(toolsSection.trim());
    return this;
  }

  /**
   * Compiles the final prompt string.
   */
  public build(): string {
    return this.parts.join('\n\n----------------------------------------\n\n');
  }
}
