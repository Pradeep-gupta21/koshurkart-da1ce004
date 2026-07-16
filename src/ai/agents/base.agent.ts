/**
 * KoshurKart — BaseAgent
 * =================================================================
 * Abstract base class implementing the shared orchestration every `Agent`
 * (see src/ai/agents/types.ts) needs, so a concrete agent only has to bind an
 * `audience` and a few defaults. It is the layer that *composes* the module's
 * other seams — reasoning, tools, planning, memory — into one turn.
 *
 * What the base owns:
 *  - the turn pipeline: recall → compose → generate → run tools → persist;
 *  - a bounded tool loop that runs the model's tool calls through the injected
 *    `ToolExecutor` and feeds results back until the model stops or the
 *    round-trip cap is hit;
 *  - memory recall (conversation window + summary + durable user facts) folded
 *    into the request, and persistence of the exchange afterwards;
 *  - a single-pass `stream()` that delegates to the provider's streaming;
 *  - `plan()` that wires a full `PlannerContext` from the injected deps;
 *  - normalization of every failure into an `AgentError` so one bad turn never
 *    throws into a caller's render path.
 *
 * IMPORTANT — provider-agnostic and business-logic-free:
 *  - It imports no provider SDK, reaches no network, holds no API keys.
 *  - It contains NO marketplace specifics — the audience-scoped prompt,
 *    tools, and knowledge all arrive through injected dependencies.
 *  - Everything concrete is injected via `AgentDependencies`; nothing here is
 *    constructed against a real backend.
 */

import { AIService } from "@/ai/services/ai.service";
import type {
  Goal,
  Planner,
  PlannerContext,
  PlannerError,
  PlannerResult,
  PlannerState,
  PlannerEventListener,
  Unsubscribe,
} from "@/ai/planner";
import type { ToolExecutor, ToolLogger, ToolRegistry } from "@/ai/tools";
import type { MemoryContext } from "@/ai/memory";
import type {
  AIChatRequest,
  AIChatResponse,
  AIRequestOptions,
  AIStreamEvent,
  ChatAudience,
  ChatMessage,
  FinishReason,
  ToolCall,
  ToolResult as WireToolResult,
  TokenUsage,
} from "@/ai/types/chat";
import {
  agentErr,
  agentOk,
  type Agent,
  type AgentCapabilities,
  type AgentConfig,
  type AgentDependencies,
  type AgentError,
  type AgentInput,
  type AgentInvocation,
  type AgentMemory,
  type AgentResponse,
  type AgentResult,
  type AgentToolInvocation,
  type ReflectionMetadata,
} from "./types";
import {
  AgentEventStream,
  createPlannerBridge,
  errorEvent,
  type AgentStreamEvent,
} from "./events";

export abstract class BaseAgent<
  TServices extends Record<string, unknown> = Record<string, unknown>,
> implements Agent<TServices>
{
  /** Default identifier the concrete agent binds (e.g. "customer"). */
  protected abstract readonly defaultId: string;
  /** Default human-readable name the concrete agent binds. */
  protected abstract readonly defaultLabel: string;
  /** The surface this agent serves — bound by the concrete subclass. */
  abstract readonly audience: ChatAudience;

  /** Optional config override for the id/label; falls back to the defaults. */
  private readonly configId?: string;
  private readonly configLabel?: string;

  /** Stable identifier, e.g. "customer". */
  get id(): string {
    return this.configId ?? this.defaultId;
  }

  /** Human-readable name for logs/registries. */
  get label(): string {
    return this.configLabel ?? this.defaultLabel;
  }

  /** The injected dependency seam (reasoning, tools, planner, memory). */
  protected readonly deps: AgentDependencies<TServices>;

  /** Explicit system-prompt override, or `undefined` to defer to the AIService. */
  protected readonly systemPrompt?: string;

  /** Baseline generation options merged into every turn. */
  protected readonly defaultOptions: AIRequestOptions;

  /** Round-trip ceiling for the tool loop. */
  protected readonly maxToolRoundtrips: number;

  /** Whether to advertise registry tools to the model. */
  protected readonly advertiseTools: boolean;

  /** Recall window size override, or `undefined` for the memory's default. */
  protected readonly historyWindow?: number;

  /** Fold durable user facts into the prompt when available. */
  protected readonly includeUserFacts: boolean;

  /** Compact conversation memory after each turn. */
  protected readonly compactAfterTurn: boolean;

  /** Whether a mandatory reflection phase runs after the tool loop to verify the answer. */
  protected readonly reflectionEnabled: boolean;

  /** Optional override for the model used during reflection. */
  protected readonly reflectionModel?: string;

  constructor(config: AgentConfig<TServices>) {
    this.deps = config.dependencies;
    this.systemPrompt = config.systemPrompt;
    this.defaultOptions = config.defaultOptions ?? {};
    this.maxToolRoundtrips = Math.max(0, config.maxToolRoundtrips ?? 4);
    this.advertiseTools = config.advertiseTools ?? Boolean(this.deps.tools);
    this.historyWindow = config.historyWindow;
    this.includeUserFacts = config.includeUserFacts ?? true;
    this.compactAfterTurn = config.compactAfterTurn ?? true;
    this.reflectionEnabled = config.reflectionEnabled ?? false;
    this.reflectionModel = config.reflectionModel;
    this.configId = config.id;
    this.configLabel = config.label;
  }

  /* -------------------------------------------------------------- *
   * Introspection
   * -------------------------------------------------------------- */

  /** What this agent can do, derived from which dependencies are present. */
  get capabilities(): AgentCapabilities {
    return {
      streaming: this.deps.ai.supportsStreaming,
      tools: Boolean(this.deps.tools && this.deps.executor),
      planning: Boolean(this.deps.planner),
      memory: Boolean(this.deps.memory?.conversation),
    };
  }

  /* -------------------------------------------------------------- *
   * Conversational turn
   * -------------------------------------------------------------- */

  /**
   * Run a single turn end-to-end. Recalls memory, composes the request,
   * generates a reply, drives the tool loop, persists the exchange, and
   * returns a normalized result. Never rejects for expected failures.
   */
  async chat(
    input: AgentInput,
    invocation: AgentInvocation<TServices> = {},
  ): Promise<AgentResult> {
    if (invocation.signal?.aborted) {
      return agentErr("Turn aborted before it started.", "cancelled");
    }

    const inputMessages = this.normalizeInput(input);
    if (inputMessages.length === 0) {
      return agentErr("Agent turn requires non-empty input.", "invalid_input");
    }

    try {
      // --- Recall -------------------------------------------------
      const history = await this.recallHistory(invocation);
      const systemPrompt = await this.buildSystemPrompt(invocation);

      // Persist the incoming user turn(s) before generating.
      await this.persistMessages(inputMessages, invocation);

      // --- Compose + generate (with the tool loop) ---------------
      const running: ChatMessage[] = [...history, ...inputMessages];
      const toolInvocations: AgentToolInvocation[] = [];
      let roundtrips = 0;
      let response: AIChatResponse | undefined;

      // First pass plus up to `maxToolRoundtrips` tool-resolving passes.
      for (let pass = 0; pass <= this.maxToolRoundtrips; pass++) {
        if (invocation.signal?.aborted) {
          return agentErr("Turn cancelled.", "cancelled");
        }

        const request = this.buildRequest(running, systemPrompt, invocation);
        response = await this.deps.ai.chat(request);
        roundtrips++;

        // Record and persist whatever the model produced this pass.
        await this.persistMessages([response.message], invocation);

        const calls = response.toolCalls ?? response.message.toolCalls ?? [];
        const canRunTools =
          calls.length > 0 &&
          Boolean(this.deps.executor) &&
          pass < this.maxToolRoundtrips;

        if (!canRunTools) break;

        // Run every requested tool and feed the results back as `tool` turns.
        running.push(response.message);
        const toolMessages = await this.runToolCalls(
          calls,
          toolInvocations,
          invocation,
        );
        running.push(...toolMessages);
        await this.persistMessages(toolMessages, invocation);
      }

      // --- Compaction --------------------------------------------
      if (this.compactAfterTurn) await this.maybeCompact(invocation);

      let finalResponse = this.buildAgentResponse(
        response,
        toolInvocations,
        roundtrips,
      );

      // --- Reflection Phase --------------------------------------
      if (this.reflectionEnabled) {
        let reflectionResult = await this.runReflection(
          running,
          systemPrompt,
          invocation,
          false
        );

        if (!reflectionResult.metadata.success) {
          // Trigger one final self-correction pass
          running.push(
            AIService.createMessage(
              "user",
              `Self-Reflection Feedback: ${reflectionResult.metadata.feedback}. Please correct your response and address the missed actions.`
            )
          );
          
          const correctionRequest = this.buildRequest(running, systemPrompt, invocation);
          const correctionResponse = await this.deps.ai.chat(correctionRequest);
          roundtrips++;
          
          await this.persistMessages([correctionResponse.message], invocation);
          
          finalResponse = this.buildAgentResponse(
            correctionResponse,
            toolInvocations,
            roundtrips
          );

          // Second attempt reflection metadata is attached directly, even if it fails,
          // instead of looping forever.
          const secondReflection = await this.runReflection(
             running, 
             systemPrompt, 
             invocation,
             true // isCorrection = true
          );
          reflectionResult = secondReflection;
        }

        finalResponse = {
          ...finalResponse,
          reflection: reflectionResult.metadata
        };
      }

      return agentOk(finalResponse);
    } catch (caught) {
      return agentErr(this.normalizeThrow(caught));
    }
  }

  /* -------------------------------------------------------------- *
   * Streaming turn (single pass)
   * -------------------------------------------------------------- */

  /**
   * Stream a single turn's reply. This does NOT drive the tool loop — it is a
   * one-pass stream for incremental rendering; callers wanting tool execution
   * use `chat()`. The user turn is persisted up front; the streamed assistant
   * text is not (the caller owns assembling and persisting it if desired).
   */
  async *stream(
    input: AgentInput,
    invocation: AgentInvocation<TServices> = {},
  ): AsyncIterable<AIStreamEvent> {
    const inputMessages = this.normalizeInput(input);
    if (inputMessages.length === 0) {
      yield {
        type: "error",
        error: {
          code: "invalid_request",
          message: "Agent turn requires non-empty input.",
          retryable: false,
        },
      };
      return;
    }

    let request: AIChatRequest;
    try {
      const history = await this.recallHistory(invocation);
      const systemPrompt = await this.buildSystemPrompt(invocation);
      await this.persistMessages(inputMessages, invocation);
      request = this.buildRequest(
        [...history, ...inputMessages],
        systemPrompt,
        invocation,
      );
    } catch (caught) {
      const error = this.normalizeThrow(caught);
      yield {
        type: "error",
        error: { code: "unknown", message: error.message, retryable: false },
      };
      return;
    }

    for await (const event of this.deps.ai.stream(request)) {
      yield event;
    }
  }

  /* -------------------------------------------------------------- *
   * Rich streaming turn (orchestration events)
   * -------------------------------------------------------------- */

  /**
   * Stream a full turn as **rich** `AgentStreamEvent`s: the assistant text
   * (`delta`) plus typed orchestration events for memory (`memory_*`), tool
   * execution (`tool_*`), and reflection (`reflection_*`), terminated by a
   * single `done`. Unlike `stream()`, this DRIVES the tool loop end to end.
   *
   * The base `AIStreamEvent` variants (`delta`/`tool_call`/`done`/`error`) are
   * preserved, so existing SSE consumers keep working; orchestration events are
   * purely additive. Emits only the memory events that actually occur (i.e.
   * when conversation memory is wired). Never throws — failures surface as an
   * `error` event.
   */
  async *streamTurn(
    input: AgentInput,
    invocation: AgentInvocation<TServices> = {},
  ): AsyncIterable<AgentStreamEvent> {
    if (invocation.signal?.aborted) {
      yield errorEvent("Turn aborted before it started.", "invalid_request");
      return;
    }

    const inputMessages = this.normalizeInput(input);
    if (inputMessages.length === 0) {
      yield errorEvent("Agent turn requires non-empty input.", "invalid_request");
      return;
    }

    const hasMemory = Boolean(
      this.deps.memory?.conversation && invocation.conversationId,
    );

    try {
      // --- Recall -------------------------------------------------
      if (hasMemory) yield { type: "memory_search", scope: "conversation" };
      const history = await this.recallHistory(invocation);
      const systemPrompt = await this.buildSystemPrompt(invocation);
      if (hasMemory) {
        yield { type: "memory_hit", scope: "conversation", count: history.length };
      }

      // Persist the incoming user turn(s) before generating.
      await this.persistMessages(inputMessages, invocation);
      if (hasMemory) {
        yield {
          type: "memory_store",
          scope: "conversation",
          count: inputMessages.length,
        };
      }

      // --- Generate + tool loop -----------------------------------
      const running: ChatMessage[] = [...history, ...inputMessages];
      let finishReason: FinishReason = "stop";
      let usage: TokenUsage | undefined;

      for (let pass = 0; pass <= this.maxToolRoundtrips; pass++) {
        if (invocation.signal?.aborted) {
          yield this.doneOf("cancelled", usage);
          return;
        }

        const request = this.buildRequest(running, systemPrompt, invocation);
        let assistantText = "";
        const toolCalls: ToolCall[] = [];
        let failed = false;

        for await (const event of this.deps.ai.stream(request)) {
          if (event.type === "delta") {
            assistantText += event.content;
            yield event; // preserve base delta event
          } else if (event.type === "tool_call") {
            toolCalls.push(event.toolCall);
            yield event; // preserve base tool_call (model's request)
          } else if (event.type === "done") {
            finishReason = event.finishReason;
            usage = event.usage;
          } else if (event.type === "error") {
            yield event;
            failed = true;
            break;
          }
        }
        if (failed) return;

        const assistantMessage = AIService.createMessage(
          "assistant",
          assistantText,
          toolCalls.length > 0 ? { toolCalls } : undefined,
        );
        await this.persistMessages([assistantMessage], invocation);

        const canRunTools =
          toolCalls.length > 0 &&
          Boolean(this.deps.executor) &&
          pass < this.maxToolRoundtrips;

        if (!canRunTools) break;

        running.push(assistantMessage);
        const toolMessages = await this.streamToolCalls(toolCalls, invocation);
        for await (const event of toolMessages.events) yield event;
        running.push(...toolMessages.messages);
        await this.persistMessages(toolMessages.messages, invocation);
      }

      // --- Reflection --------------------------------------------
      if (this.reflectionEnabled) {
        yield { type: "reflection_start" };
        const reflection = await this.runReflection(
          running,
          systemPrompt,
          invocation,
          false,
        );
        yield {
          type: "reflection_complete",
          success: reflection.metadata.success,
          feedback: reflection.metadata.feedback,
          selfCorrected: reflection.metadata.selfCorrected,
        };
      }

      // --- Compaction --------------------------------------------
      if (this.compactAfterTurn) await this.maybeCompact(invocation);

      yield this.doneOf(finishReason, usage);
    } catch (caught) {
      const error = this.normalizeThrow(caught);
      yield errorEvent(error.message, "unknown", Boolean(error.retryable));
    }
  }

  /**
   * Execute the model's requested tool calls, producing both the `tool` turns
   * to feed back to the model AND the `tool_start` / `tool_result` /
   * `tool_error` events to stream. Kept separate from `runToolCalls` so the
   * non-streaming `chat()` path is untouched.
   */
  private async streamToolCalls(
    calls: readonly ToolCall[],
    invocation: AgentInvocation<TServices>,
  ): Promise<{ messages: ChatMessage[]; events: AsyncIterable<AgentStreamEvent> }> {
    const executor: ToolExecutor<TServices> | undefined = this.deps.executor;
    const messages: ChatMessage[] = [];
    const events: AgentStreamEvent[] = [];
    const delegationChain = invocation.metadata?.delegationChain as
      | readonly string[]
      | undefined;

    for (const call of calls) {
      events.push({
        type: "tool_start",
        toolCallId: call.id,
        name: call.name,
        arguments: call.arguments,
      });

      const result: WireToolResult = executor
        ? await executor.run(call, { signal: invocation.signal, delegationChain })
        : {
            toolCallId: call.id,
            result: {
              code: "unavailable",
              message: `No executor is wired to run tool "${call.name}".`,
            },
            isError: true,
          };

      if (result.isError) {
        events.push({
          type: "tool_error",
          toolCallId: call.id,
          name: call.name,
          error: this.stringifyResult(result.result),
        });
      } else {
        events.push({
          type: "tool_result",
          toolCallId: call.id,
          name: call.name,
          result: result.result,
        });
      }

      messages.push(
        AIService.createMessage("tool", this.stringifyResult(result.result), {
          toolCallId: result.toolCallId,
          metadata: { toolName: call.name, isError: result.isError },
        }),
      );
    }

    return {
      messages,
      events: (async function* () {
        for (const event of events) yield event;
      })(),
    };
  }

  /** Build the terminal `done` event, omitting `usage` when absent. */
  private doneOf(
    finishReason: FinishReason,
    usage: TokenUsage | undefined,
  ): AgentStreamEvent {
    return usage
      ? { type: "done", finishReason, usage }
      : { type: "done", finishReason };
  }

  /* -------------------------------------------------------------- *
   * Rich streaming plan (planner events)
   * -------------------------------------------------------------- */

  /**
   * Run the injected planner for a goal, streaming its lifecycle as
   * `plan_start` / `plan_step` / `plan_complete` events (bridged from the
   * planner's own event emitter). Yields a single `error` event when no
   * planner is injected. The planner's final `PlannerResult` is awaited but
   * surfaced through the events, mirroring `plan()`'s no-throw contract.
   */
  async *streamPlan(
    goal: Goal,
    invocation: AgentInvocation<TServices> = {},
  ): AsyncIterable<AgentStreamEvent> {
    const planner: Planner<TServices> | undefined = this.deps.planner;
    if (!planner) {
      yield errorEvent("No planner is injected into this agent.", "invalid_request");
      return;
    }

    const stream = new AgentEventStream();
    const listener: PlannerEventListener = createPlannerBridge((e) => stream.emit(e));

    // Subscribe when the planner exposes an emitter (BasePlanner does).
    const subscribable = planner as unknown as {
      on?: (l: PlannerEventListener) => Unsubscribe;
    };
    const unsubscribe: Unsubscribe | undefined =
      typeof subscribable.on === "function"
        ? subscribable.on(listener)
        : undefined;

    const run = planner
      .run(goal, this.toPlannerContext(invocation))
      .catch(() => undefined)
      .finally(() => {
        unsubscribe?.();
        stream.close();
      });

    try {
      for await (const event of stream) yield event;
    } finally {
      await run;
    }
  }

  /* -------------------------------------------------------------- *
   * Planning
   * -------------------------------------------------------------- */

  /**
   * Delegate a multi-step objective to the injected planner. Returns a failed
   * `PlannerResult` (rather than throwing) when no planner is wired.
   */
  async plan(
    goal: Goal,
    invocation: AgentInvocation<TServices> = {},
  ): Promise<PlannerResult> {
    const planner: Planner<TServices> | undefined = this.deps.planner;
    if (!planner) {
      return this.plannerUnavailable(invocation);
    }
    return planner.run(goal, this.toPlannerContext(invocation));
  }

  /**
   * Build a `PlannerContext` from this agent's dependencies and an
   * invocation. Exposed so callers can drive the planner directly with the
   * same wiring the agent would use.
   */
  toPlannerContext(
    invocation: AgentInvocation<TServices> = {},
  ): PlannerContext<TServices> {
    return {
      audience: this.audience,
      userId: invocation.userId,
      conversationId: invocation.conversationId,
      ai: this.deps.ai,
      tools: this.deps.tools,
      executor: this.deps.executor,
      signal: invocation.signal,
      now: this.clockFor(invocation),
      logger: this.loggerFor(invocation),
      services: this.servicesFor(invocation),
      metadata: invocation.metadata,
    };
  }

  /* -------------------------------------------------------------- *
   * Reset
   * -------------------------------------------------------------- */

  /** Clear the conversation and session memory for the invocation's scope. */
  async reset(invocation: AgentInvocation<TServices>): Promise<void> {
    const memory = this.deps.memory;
    if (!memory) return;
    const ctx = this.memoryContext(invocation);
    if (memory.conversation && invocation.conversationId) {
      await memory.conversation.clearScope(ctx);
    }
    if (memory.session && invocation.sessionId) {
      await memory.session.clearScope(ctx);
    }
  }

  /* -------------------------------------------------------------- *
   * Recall & prompt composition (extension points)
   * -------------------------------------------------------------- */

  /**
   * Recall the recent conversation window (verbatim turns only — the summary
   * and user facts are folded into the system prompt instead, so they never
   * suppress the audience prompt the AIService prepends). Returns `[]` when no
   * conversation memory or conversation id is available.
   */
  protected async recallHistory(
    invocation: AgentInvocation<TServices>,
  ): Promise<ChatMessage[]> {
    const conversation = this.deps.memory?.conversation;
    if (!conversation || !invocation.conversationId) return [];
    return conversation.window(this.memoryContext(invocation), this.historyWindow);
  }

  /**
   * Build the effective system prompt for the turn by folding recalled
   * memory (the latest conversation summary + durable user facts) into the
   * configured base prompt.
   *
   * When no base prompt is configured AND there is no recalled context, this
   * returns `undefined` so the injected `AIService` resolves the audience
   * prompt from its own map. When recalled context exists it is folded in;
   * pair fact/summary recall with a configured `systemPrompt` (or an
   * AIService whose map covers the audience) to keep the base guidance.
   */
  protected async buildSystemPrompt(
    invocation: AgentInvocation<TServices>,
  ): Promise<string | undefined> {
    const parts: string[] = [];
    if (this.systemPrompt) parts.push(this.systemPrompt);

    const summary = await this.recallSummary(invocation);
    if (summary) parts.push(`Summary of earlier conversation:\n${summary}`);

    const facts = await this.recallUserFacts(invocation);
    if (facts.length > 0) {
      parts.push(`Known facts about the user:\n- ${facts.join("\n- ")}`);
    }

    return parts.length > 0 ? parts.join("\n\n") : undefined;
  }

  /** The latest conversation summary text, if conversation memory holds one. */
  protected async recallSummary(
    invocation: AgentInvocation<TServices>,
  ): Promise<string | undefined> {
    const conversation = this.deps.memory?.conversation;
    if (!conversation || !invocation.conversationId) return undefined;
    const summary = await conversation.latestSummary(this.memoryContext(invocation));
    return summary?.text || undefined;
  }

  /** Durable user facts/notes to inject, when enabled and available. */
  protected async recallUserFacts(
    invocation: AgentInvocation<TServices>,
  ): Promise<string[]> {
    const user = this.deps.memory?.user;
    if (!this.includeUserFacts || !user || !invocation.userId) return [];
    return user.facts(this.memoryContext(invocation));
  }

  /* -------------------------------------------------------------- *
   * Persistence (extension point)
   * -------------------------------------------------------------- */

  /** Append messages to conversation memory, when present. Best-effort. */
  protected async persistMessages(
    messages: readonly ChatMessage[],
    invocation: AgentInvocation<TServices>,
  ): Promise<void> {
    const conversation = this.deps.memory?.conversation;
    if (!conversation || !invocation.conversationId || messages.length === 0) {
      return;
    }
    await conversation.appendMany(messages, this.memoryContext(invocation));
  }

  /** Fold overflowed turns into a summary when the thread has grown. */
  protected async maybeCompact(
    invocation: AgentInvocation<TServices>,
  ): Promise<void> {
    const conversation = this.deps.memory?.conversation;
    if (!conversation || !invocation.conversationId) return;
    await conversation.maybeCompact(this.memoryContext(invocation));
  }

  /* -------------------------------------------------------------- *
   * Request building
   * -------------------------------------------------------------- */

  /**
   * Assemble the `AIChatRequest` for a pass. Merges default + per-turn
   * options, advertises audience-scoped tools when enabled, and forwards the
   * abort signal. The system prompt is passed explicitly so recalled memory
   * folded into it is respected.
   */
  protected buildRequest(
    messages: ChatMessage[],
    systemPrompt: string | undefined,
    invocation: AgentInvocation<TServices>,
  ): AIChatRequest {
    const options: AIRequestOptions = {
      ...this.defaultOptions,
      ...invocation.options,
    };
    if (invocation.signal) options.signal = invocation.signal;

    const registry: ToolRegistry | undefined = this.deps.tools;
    if (this.advertiseTools && registry && !options.tools) {
      const defs = registry.toDefinitions(this.audience);
      if (defs.length > 0) options.tools = defs;
    }

    return {
      audience: this.audience,
      messages,
      systemPrompt,
      options,
    };
  }

  /* -------------------------------------------------------------- *
   * Tool loop
   * -------------------------------------------------------------- */

  /**
   * Run each requested tool through the injected executor, collecting both
   * the wire results (to feed back to the model) and the invocation record
   * (to surface on the response). Missing executor → an `unavailable` wire
   * error per call, so the model can recover gracefully.
   */
  protected async runToolCalls(
    calls: readonly ToolCall[],
    sink: AgentToolInvocation[],
    invocation: AgentInvocation<TServices>,
  ): Promise<ChatMessage[]> {
    const executor: ToolExecutor<TServices> | undefined = this.deps.executor;
    const messages: ChatMessage[] = [];

    // Extract the delegation chain from invocation metadata (if present)
    // so delegation tools can detect multi-hop cycles.
    const delegationChain = invocation.metadata?.delegationChain as
      | readonly string[]
      | undefined;

    for (const call of calls) {
      const result: WireToolResult = executor
        ? await executor.run(call, {
            signal: invocation.signal,
            delegationChain,
          })
        : {
            toolCallId: call.id,
            result: {
              code: "unavailable",
              message: `No executor is wired to run tool "${call.name}".`,
            },
            isError: true,
          };

      sink.push({ call, result });
      messages.push(
        AIService.createMessage("tool", this.stringifyResult(result.result), {
          toolCallId: result.toolCallId,
          metadata: { toolName: call.name, isError: result.isError },
        }),
      );
    }

    return messages;
  }

  /* -------------------------------------------------------------- *
   * Context builders
   * -------------------------------------------------------------- */

  /** Build a `MemoryContext` for the invocation's scope. */
  protected memoryContext(
    invocation: AgentInvocation<TServices>,
  ): MemoryContext<TServices> {
    return {
      audience: this.audience,
      userId: invocation.userId,
      conversationId: invocation.conversationId,
      sessionId: invocation.sessionId,
      now: this.clockFor(invocation),
      logger: this.loggerFor(invocation),
      services: this.servicesFor(invocation),
      metadata: invocation.metadata,
    };
  }

  /* -------------------------------------------------------------- *
   * Helpers
   * -------------------------------------------------------------- */

  /** Coerce turn input into an ordered `ChatMessage[]` of user turns. */
  protected normalizeInput(input: AgentInput): ChatMessage[] {
    if (typeof input === "string") {
      const text = input.trim();
      return text ? [AIService.createMessage("user", text)] : [];
    }
    if (Array.isArray(input)) {
      return input.filter((m): m is ChatMessage => Boolean(m && m.role));
    }
    const message = input as ChatMessage;
    return message && message.role ? [message] : [];
  }

  /** Assemble the public `AgentResponse` from the final generation. */
  protected buildAgentResponse(
    response: AIChatResponse | undefined,
    toolInvocations: AgentToolInvocation[],
    roundtrips: number,
  ): AgentResponse {
    if (!response) {
      // Should not happen (the loop always runs at least once), but keep the
      // return type honest rather than asserting non-null.
      return {
        message: AIService.createMessage("assistant", ""),
        finishReason: "error",
        toolInvocations,
        roundtrips,
        model: "",
        provider: this.deps.ai.providerId,
      };
    }
    return {
      message: response.message,
      finishReason: response.finishReason,
      toolInvocations,
      roundtrips,
      model: response.model,
      provider: response.provider,
      usage: response.usage as TokenUsage | undefined,
    };
  }

  /** Serialize a tool result payload for a `tool` message's content. */
  protected stringifyResult(result: unknown): string {
    if (typeof result === "string") return result;
    try {
      return JSON.stringify(result ?? null);
    } catch {
      return String(result);
    }
  }

  /** Resolve the clock for a turn: invocation → agent → `Date.now`. */
  protected clockFor(invocation: AgentInvocation<TServices>): () => number {
    return invocation.now ?? this.deps.now ?? (() => Date.now());
  }

  /** Resolve the logger for a turn: invocation → agent. */
  protected loggerFor(
    invocation: AgentInvocation<TServices>,
  ): ToolLogger | undefined {
    return invocation.logger ?? this.deps.logger;
  }

  /** Merge per-turn services over the agent's default services bag. */
  protected servicesFor(
    invocation: AgentInvocation<TServices>,
  ): TServices | undefined {
    const base = this.deps.services;
    const overlay = invocation.services;
    if (base && overlay) return { ...base, ...overlay };
    return overlay ?? base;
  }

  /** Coerce an unknown thrown value into a normalized `AgentError`. */
  protected normalizeThrow(caught: unknown): AgentError {
    if (this.isAgentError(caught)) return caught;
    const isAbort = caught instanceof Error && caught.name === "AbortError";
    const message = caught instanceof Error ? caught.message : String(caught);
    return {
      code: isAbort ? "cancelled" : "provider_error",
      message,
      retryable: isAbort,
      cause: caught,
    };
  }

  /** Type guard for an already-normalized `AgentError`. */
  protected isAgentError(value: unknown): value is AgentError {
    return (
      typeof value === "object" &&
      value !== null &&
      "code" in value &&
      "message" in value
    );
  }

  /** Build the failed `PlannerResult` returned when no planner is injected. */
  protected plannerUnavailable(
    invocation: AgentInvocation<TServices>,
  ): PlannerResult {
    const error: PlannerError = {
      code: "unavailable",
      message: "No planner is injected into this agent.",
      retryable: false,
    };
    const state: PlannerState = {
      phase: "failed",
      completedStepIds: [],
      failedStepIds: [],
      error,
      updatedAt: this.clockFor(invocation)(),
    };
    return { ok: false, state, error };
  }

  /* -------------------------------------------------------------- *
   * Reflection Phase
   * -------------------------------------------------------------- */

  /** 
   * Runs the mandatory reflection phase if enabled. It forces the model to 
   * review its own trajectory and output structured JSON determining success.
   */
  protected async runReflection(
    messages: ChatMessage[],
    systemPrompt: string | undefined,
    invocation: AgentInvocation<TServices>,
    isCorrection: boolean = false
  ): Promise<{ metadata: ReflectionMetadata }> {
    const reflectionPrompt = `
You are a reflection engine. Review the conversation trajectory.
Evaluate whether the assistant achieved the objective and provided an accurate, complete answer.
Evaluate whether all planner steps completed.
Evaluate whether any required tool calls were missed.
Evaluate whether the final answer is complete and accurate.

OUTPUT FORMAT: Return ONLY valid JSON matching this schema. Do NOT include markdown codeblocks or any surrounding text.
{
  "success": boolean,
  "feedback": "string explaining what was good or what was missed",
  "missedActions": ["tool_name1", "tool_name2"]
}
`;
    // We omit tools from the options to force the model to just reason and output JSON
    const requestOptions: AIRequestOptions = {
       ...this.defaultOptions,
       ...invocation.options,
       model: this.reflectionModel ?? this.defaultOptions.model ?? invocation.options?.model,
       tools: undefined
    };
    if (invocation.signal) requestOptions.signal = invocation.signal;
    
    const reflectionRequest: AIChatRequest = {
      audience: this.audience,
      messages: [
        ...messages,
        AIService.createMessage("user", reflectionPrompt)
      ],
      systemPrompt, 
      options: requestOptions
    };

    const response = await this.deps.ai.chat(reflectionRequest);
    let parsed: any;
    try {
      // Clean up markdown block if present
      const text = response.message.content.replace(/^```(json)?/im, "").replace(/```$/im, "").trim();
      parsed = JSON.parse(text);
    } catch {
      // If parsing fails, fail gracefully instead of looping
      return { 
        metadata: { 
          success: true, 
          feedback: "Reflection parse error. Assuming success.", 
          missedActions: [], 
          selfCorrected: isCorrection 
        } 
      };
    }

    return {
      metadata: {
        success: Boolean(parsed.success),
        feedback: String(parsed.feedback || ""),
        missedActions: Array.isArray(parsed.missedActions) ? parsed.missedActions.map(String) : [],
        selfCorrected: isCorrection
      }
    };
  }
}
