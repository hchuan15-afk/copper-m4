"use server";

// The server action the Ask Copper chat calls. It streams the conversation to
// the model through callStream (lib/ai/call.ts), with or without the tools,
// and sends back each step as it happens, so the panel can show Copper
// thinking and using its tools.
// Module 4: on the Support page the browser also sends the refund state, and
// Copper gets one more tool, transfer_to_refund_agent. When Copper calls it,
// Copper stops and the Refund agent (refund-agent.ts) takes the same
// conversation with its own instructions and tools.
import { hasToolCall, stepCountIs, tool } from "ai";
import { z } from "zod";
import { callStream, THOUGHT_SUMMARIES } from "@/lib/ai/call";
import { createLive, type Live } from "@/lib/ai/live";
import { COPPER_INSTRUCTIONS } from "@/lib/copper/assistant/instructions";
import type { Progress, ToolStep } from "@/lib/copper/assistant/progress";
import {
  decisionInstructions,
  REFUND_INSTRUCTIONS,
  refundTools,
} from "@/lib/copper/assistant/refund-agent";
import { copperTools } from "@/lib/copper/assistant/tools";
import type { RefundState } from "@/lib/copper/refunds";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AskCopperRequest = {
  messages: ChatMessage[];
  useTools: boolean;
  /** The Support page's orders and limit. Without it there are no refunds. */
  refunds?: RefundState;
};

export type AskCopperResult = { progress: Live<Progress> };

/** At most this many model steps (tool calls plus the reply) per question. */
const MAX_STEPS = 5;

const SORRY = "Sorry, something went wrong on my end. Please try again.";

const HANDOFF = "transfer_to_refund_agent";

const REFUND_HANDOFF = `

Refunds: you can't give refunds yourself. When the customer asks for a refund or their money back on something they bought (an order, a device, a plan), call ${HANDOFF} right away and say nothing else; the Refund agent takes over. Also call it when the customer is answering the Refund agent (for example, giving an order number), or says a refund was approved or should be. Questions about what the refund policy says are still yours: answer those with search_docs.`;

const NO_REFUNDS_HERE = `

Refunds: if the customer asks for a refund on an order, tell them to open the Support page (/support), where the Refund agent can help.`;

type StreamResult = ReturnType<typeof callStream>;

export async function askCopper({
  messages,
  useTools,
  refunds,
}: AskCopperRequest): Promise<AskCopperResult> {
  const run = startProgress("copper");

  if (!useTools) {
    // Without tools, send no instructions either: "always use your tools"
    // with no tools makes the model answer with nothing.
    run.go(async () => {
      await run.pump(
        callStream(
          { module: 2, feature: "ask-copper" },
          { messages, providerOptions: THOUGHT_SUMMARIES },
        ),
      );
    });
    return { progress: run.live };
  }

  run.go(async () => {
    const tools = refunds
      ? {
          ...copperTools,
          [HANDOFF]: tool({
            description:
              "Hands the conversation to the Refund agent. Use it whenever the customer asks for a refund or their money back.",
            inputSchema: z.object({
              reason: z
                .string()
                .describe("In a few words, what the customer wants refunded"),
            }),
            execute: async () => ({ handedOffTo: "Refund agent" }),
          }),
        }
      : copperTools;
    await run.pump(
      callStream(
        { module: 2, feature: "ask-copper" },
        {
          messages,
          providerOptions: THOUGHT_SUMMARIES,
          instructions:
            COPPER_INSTRUCTIONS + (refunds ? REFUND_HANDOFF : NO_REFUNDS_HERE),
          tools,
          stopWhen: [stepCountIs(MAX_STEPS), hasToolCall(HANDOFF)],
        },
      ),
    );
    const handedOff = run.progress.steps.some(
      (s) => s.type === "tool" && s.name === HANDOFF && s.state === "done",
    );
    if (!refunds || !handedOff) return;

    // The hand-off: the Refund agent answers the same conversation.
    run.progress.steps.push({ type: "handoff", to: "refund" });
    run.progress.agent = "refund";
    run.progress.reply = "";
    run.update();
    await run.pump(
      callStream(
        { module: 4, feature: "refund-agent" },
        {
          messages,
          providerOptions: THOUGHT_SUMMARIES,
          instructions: REFUND_INSTRUCTIONS,
          tools: refundTools(refunds),
          stopWhen: stepCountIs(MAX_STEPS),
        },
      ),
    );
  });
  return { progress: run.live };
}

export type RefundDecisionRequest = {
  messages: ChatMessage[];
  decision: "approved" | "rejected";
  order: { id: string; item: string; amountUsd: number };
};

/**
 * After a person clicks Approve or Reject in the Refund Console, the Refund
 * agent tells the customer in the chat. The person's click is the decision;
 * the agent only writes the message.
 */
export async function announceRefundDecision({
  messages,
  decision,
  order,
}: RefundDecisionRequest): Promise<AskCopperResult> {
  const run = startProgress("refund");
  run.go(async () => {
    await run.pump(
      callStream(
        { module: 4, feature: "refund-decision" },
        {
          messages: [
            ...messages,
            {
              role: "user",
              content: `(Message from the Refund Console, not the customer: the refund for order #${order.id} was ${decision} by a person.)`,
            },
          ],
          instructions: decisionInstructions(decision, order),
        },
      ),
    );
  });
  return { progress: run.live };
}

/** The live progress for one answer, and how to feed a model stream into it. */
function startProgress(agent: "copper" | "refund") {
  const { live, update, done } = createLive<Progress>();
  const progress: Progress = {
    steps: [],
    reply: "",
    status: "working",
    agent,
  };
  // A fresh copy each time, so earlier updates never change underneath the
  // panel.
  const snapshot = (): Progress => ({
    ...progress,
    steps: progress.steps.map((step) => ({ ...step })),
  });
  const toolStep = (id: string) =>
    progress.steps.find(
      (step): step is ToolStep => step.type === "tool" && step.id === id,
    );

  async function pump(result: StreamResult) {
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "reasoning-delta": {
          const last = progress.steps.at(-1);
          if (last?.type === "thinking") last.text += part.text;
          else progress.steps.push({ type: "thinking", text: part.text });
          break;
        }
        case "tool-input-start":
          progress.steps.push({
            type: "tool",
            id: part.id,
            name: part.toolName,
            state: "calling",
          });
          break;
        case "tool-call": {
          const step = toolStep(part.toolCallId);
          if (step) step.input = part.input;
          else
            progress.steps.push({
              type: "tool",
              id: part.toolCallId,
              name: part.toolName,
              state: "calling",
              input: part.input,
            });
          break;
        }
        case "tool-result": {
          const step = toolStep(part.toolCallId);
          if (step) Object.assign(step, { output: part.output, state: "done" });
          break;
        }
        case "tool-error": {
          const step = toolStep(part.toolCallId);
          const message =
            part.error instanceof Error
              ? part.error.message
              : String(part.error);
          if (step) Object.assign(step, { output: message, state: "error" });
          break;
        }
        case "text-delta":
          progress.reply += part.text;
          break;
        case "error":
          throw part.error;
        default:
          continue;
      }
      update(snapshot());
    }
  }

  return {
    live,
    progress,
    pump,
    update: () => update(snapshot()),
    /** Runs the answer in the background, so the panel gets the first update now. */
    go(work: () => Promise<void>) {
      void (async () => {
        try {
          await work();
          progress.status = "done";
          if (!progress.reply.trim()) progress.reply = SORRY;
        } catch {
          progress.status = "error";
          if (!progress.reply.trim()) progress.reply = SORRY;
        }
        done(snapshot());
      })();
    },
  };
}
