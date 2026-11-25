export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** Derived from authenticated access and the agent registry in the backend. */
export interface AgentScope {
  readonly organizationId: string;
  readonly actorId: string;
  readonly agentId: string;
  readonly executionId: string;
  readonly parentExecutionId?: string;
}

export interface ToolDescription {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
}

/** Requires validation and authorization before execution. */
export interface ToolProposal {
  readonly id: string;
  readonly name: string;
  readonly arguments: JsonObject;
}

export type ModelTurn =
  | { readonly role: "user"; readonly text: string }
  | {
      readonly role: "model";
      readonly text?: string;
      readonly toolProposals?: readonly ToolProposal[];
    }
  | { readonly role: "tool"; readonly proposalId: string; readonly result: JsonValue };

export interface ModelRequest {
  readonly tier: "standard" | "advanced";
  readonly instructions: string;
  readonly turns: readonly ModelTurn[];
  readonly tools: readonly ToolDescription[];
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly outputSchema?: JsonObject;
}

export interface AgentRequest {
  readonly scope: AgentScope;
  /** Only the authorized, minimized content is passed to the model adapter. */
  readonly model: ModelRequest;
}

export interface ModelUsage {
  readonly modelId: string;
  readonly latencyMs: number;
  readonly attempts?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly thinkingTokens?: number;
  readonly cachedInputTokens?: number;
  readonly estimatedCostUsd?: number;
}

export type ModelOutput =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "structured"; readonly value: JsonValue }
  | {
      readonly kind: "tool_proposals";
      readonly proposals: readonly ToolProposal[];
      readonly text?: string;
    };

export interface ModelUnavailable {
  readonly status: "unavailable";
  readonly reason: "not_implemented" | "missing_configuration" | "invalid_configuration";
}

export type ModelResult =
  | { readonly status: "completed"; readonly output: ModelOutput; readonly usage: ModelUsage }
  | ModelUnavailable
  | {
      readonly status: "failed";
      readonly reason: "timeout" | "rate_limit" | "invalid_response" | "provider_error" | "unsupported_request";
      readonly retryable: boolean;
      readonly usage?: ModelUsage;
    };

export interface ModelProvider {
  generate(request: ModelRequest): Promise<ModelResult>;
}

export const phaseOneAiState = {
  status: "unavailable",
  reason: "not_implemented",
} as const satisfies ModelUnavailable;
