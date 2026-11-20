// What Ask Copper is doing, step by step, as it streams in: Gemini's thinking
// summaries, each tool call (with what went in and what came out), and the
// reply. The panel draws this as it changes.

export type ThinkingStep = { type: "thinking"; text: string };

export type ToolStep = {
  type: "tool";
  id: string;
  name: string;
  /** "calling" until the tool's result comes back. */
  state: "calling" | "done" | "error";
  input?: unknown;
  output?: unknown;
};

/** Copper passed the conversation to the Refund agent (Module 4). */
export type HandoffStep = { type: "handoff"; to: "refund" };

export type Step = ThinkingStep | ToolStep | HandoffStep;

/** Who wrote the reply: Copper, or the Refund agent it handed off to. */
export type Agent = "copper" | "refund";

export type Progress = {
  steps: Step[];
  reply: string;
  status: "working" | "done" | "error";
  agent?: Agent;
};

/** Every tool call in an answer, in order. */
export function toolCallsOf(progress: Progress) {
  return progress.steps
    .filter((step): step is ToolStep => step.type === "tool")
    .map(({ name, input, output }) => ({ name, input, output }));
}

/**
 * The tools Copper can use, and what each one does in plain English. The chat
 * panel lists these, so it lives here (and not in tools.ts, which reads the
 * database and can't be imported by a client component).
 */
export const TOOL_LABELS: Record<string, string> = {
  get_products: "Listing the products",
  get_prices: "Looking up prices",
  calculate_cost: "Working out the cost",
  check_availability: "Checking stock",
  search_docs: "Searching the documents",
  transfer_to_refund_agent: "Handing off to the Refund agent",
};

/** The Refund agent's tools (Module 4). */
export const REFUND_TOOL_LABELS: Record<string, string> = {
  get_orders: "Looking up the orders",
  request_refund: "Asking the app for a refund",
};
