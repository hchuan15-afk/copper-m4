// Module 4: the refund rule is code. The model can't argue past it.
import { describe, expect, it } from "vitest";
import { refundTools } from "@/lib/copper/assistant/refund-agent";
import {
  cleanLimit,
  decideRefund,
  type RefundDecision,
  type RefundState,
  STARTING_ORDERS,
  statusAfter,
} from "@/lib/copper/refunds";

const state = (limitUsd: number, orders = STARTING_ORDERS): RefundState => ({
  limitUsd,
  orders,
});

describe("decideRefund", () => {
  it("refunds at or under the limit and holds anything over it", () => {
    expect(decideRefund("1002", state(100)).result).toBe("refunded");
    expect(decideRefund("1002", state(79)).result).toBe("refunded");
    expect(decideRefund("1003", state(100)).result).toBe("needs_approval");
  });

  it("holds every refund when the limit is 0, and treats a bad limit as 0", () => {
    expect(decideRefund("1001", state(0)).result).toBe("needs_approval");
    expect(cleanLimit(-50)).toBe(0);
    expect(cleanLimit("abc")).toBe(0);
    expect(decideRefund("1001", state(-50)).result).toBe("needs_approval");
  });

  it("won't refund an order twice, or one already waiting or rejected", () => {
    const orders = STARTING_ORDERS.map((o) =>
      o.id === "1002"
        ? { ...o, status: "refunded" as const }
        : o.id === "1003"
          ? { ...o, status: "waiting" as const }
          : o.id === "1004"
            ? { ...o, status: "rejected" as const }
            : o,
    );
    expect(decideRefund("1002", state(1000, orders)).result).toBe(
      "already_refunded",
    );
    expect(decideRefund("1003", state(1000, orders)).result).toBe(
      "already_waiting",
    );
    expect(decideRefund("1004", state(1000, orders)).result).toBe(
      "already_rejected",
    );
    expect(decideRefund("9999", state(1000)).result).toBe("no_such_order");
    expect(decideRefund("#1002", state(100)).result).toBe("refunded");
  });

  it("maps decisions to the order status the console shows", () => {
    expect(statusAfter(decideRefund("1002", state(100)))).toBe("refunded");
    expect(statusAfter(decideRefund("1004", state(100)))).toBe("waiting");
    expect(statusAfter(decideRefund("9999", state(100)))).toBeNull();
  });
});

describe("request_refund tool", () => {
  it("sees its own earlier request when asked twice in one answer", async () => {
    const tools = refundTools(state(100));
    const run = async (orderId: string) =>
      (await tools.request_refund.execute!(
        { orderId },
        { toolCallId: "t", messages: [], context: undefined as never },
      )) as RefundDecision;
    expect((await run("1002")).result).toBe("refunded");
    expect((await run("1002")).result).toBe("already_refunded");
  });
});
