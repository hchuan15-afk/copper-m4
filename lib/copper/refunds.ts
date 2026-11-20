// Refunds (Module 4): the customer's orders and THE RULE that decides what
// happens to a refund request. The rule is plain code, so the model can't
// talk its way past it: at or under the auto-refund limit the refund goes
// through; over it, the refund waits for a person in the Refund Console.
// No database: the browser keeps the orders and the limit, sends them with
// every chat message, and applies what the Refund agent's tool decided.

export type OrderStatus = "paid" | "refunded" | "waiting" | "rejected";

export type Order = {
  id: string;
  item: string;
  amountUsd: number;
  status: OrderStatus;
};

/** The demo customer whose orders the Refund Console shows. */
export const CUSTOMER = "Maya Reyes";

/** The auto-refund limit the console starts with. */
export const DEFAULT_LIMIT_USD = 100;

export const STARTING_ORDERS: Order[] = [
  { id: "1001", item: "Copper Plus, monthly", amountUsd: 7.99, status: "paid" },
  { id: "1002", item: "Copper Plus, annual", amountUsd: 79, status: "paid" },
  { id: "1003", item: "Copper Notes", amountUsd: 129, status: "paid" },
  { id: "1004", item: "Copper Home", amountUsd: 149, status: "paid" },
  { id: "1005", item: "Copper Notes", amountUsd: 129, status: "paid" },
];

/** What the browser sends with each chat message. */
export type RefundState = { limitUsd: number; orders: Order[] };

/** A limit typed in the console, made safe: a number, never below 0. */
export function cleanLimit(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

/** What request_refund decided, in data the model and the console both read. */
export type RefundDecision =
  | {
      result: "refunded";
      orderId: string;
      item: string;
      amountUsd: number;
      limitUsd: number;
      message: string;
    }
  | {
      result: "needs_approval";
      orderId: string;
      item: string;
      amountUsd: number;
      limitUsd: number;
      message: string;
    }
  | {
      result:
        | "already_refunded"
        | "already_waiting"
        | "already_rejected"
        | "no_such_order";
      orderId: string;
      message: string;
    };

/**
 * THE RULE. Compares the order amount with the auto-refund limit. Nothing the
 * customer or the model says changes the answer: the only inputs are the
 * order (looked up by id) and the limit the person set in the console.
 */
export function decideRefund(
  orderId: string,
  state: RefundState,
): RefundDecision {
  const limitUsd = cleanLimit(state.limitUsd);
  const id = orderId.replace(/\D/g, "");
  const order = state.orders.find((o) => o.id === id);
  if (!order)
    return {
      result: "no_such_order",
      orderId: id || orderId,
      message: `There is no order #${id || orderId} for ${CUSTOMER}.`,
    };
  if (order.status === "refunded")
    return {
      result: "already_refunded",
      orderId: id,
      message: `Order #${id} (${order.item}) was already refunded. It can't be refunded twice.`,
    };
  if (order.status === "waiting")
    return {
      result: "already_waiting",
      orderId: id,
      message: `Order #${id} (${order.item}) is already waiting for a person's approval in the Refund Console.`,
    };
  if (order.status === "rejected")
    return {
      result: "already_rejected",
      orderId: id,
      message: `A person already rejected the refund for order #${id} (${order.item}). Only the Copper Crew can look at it again.`,
    };
  const base = {
    orderId: id,
    item: order.item,
    amountUsd: order.amountUsd,
    limitUsd,
  };
  if (order.amountUsd <= limitUsd)
    return {
      ...base,
      result: "refunded",
      message: `Refunded automatically: $${order.amountUsd} is at or under the $${limitUsd} limit.`,
    };
  return {
    ...base,
    result: "needs_approval",
    message: `Not refunded yet: $${order.amountUsd} is over the $${limitUsd} limit, so a person must approve it in the Refund Console. Tell the customer it is waiting for approval.`,
  };
}

/** The order status a decision leads to, or null when nothing changes. */
export function statusAfter(decision: RefundDecision): OrderStatus | null {
  if (decision.result === "refunded") return "refunded";
  if (decision.result === "needs_approval") return "waiting";
  return null;
}
