"use client";

// The Refund Console: the auto-refund limit (a person sets it), the refunds
// waiting for a person's Approve or Reject, and the customer's orders.
import { CheckIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useRefunds } from "@/components/copper/refund-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/copper/catalog";
import { CUSTOMER, type OrderStatus } from "@/lib/copper/refunds";
import { cn } from "@/lib/utils";

const STATUS: Record<OrderStatus, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-muted text-muted-foreground" },
  waiting: {
    label: "Waiting for approval",
    className: "bg-primary text-white",
  },
  refunded: { label: "Refunded", className: "bg-accent text-white" },
  rejected: { label: "Rejected", className: "bg-chart-3 text-white" },
};

export function RefundConsole() {
  const refunds = useRefunds();
  const limit = refunds?.state.limitUsd ?? 0;
  // While typing, the box shows what was typed; otherwise the limit.
  const [draft, setDraft] = useState<string | null>(null);
  if (!refunds) return null;
  const { state, setLimit, decide, reset } = refunds;
  const waiting = state.orders.filter((o) => o.status === "waiting");

  return (
    <div className="mt-2 space-y-8">
      <p className="text-muted-foreground text-sm">
        Ask for a refund in the chat as the customer. Copper hands you to the
        Refund agent, which asks the app for the refund. The app checks the
        amount against your limit: at or under it, the refund goes through; over
        it, it waits here for you to approve or reject.
      </p>

      <section className="bg-card rounded-xl border p-4">
        <label htmlFor="limit" className="text-sm font-semibold">
          Auto-refund limit
        </label>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-muted-foreground">$</span>
          <Input
            id="limit"
            data-testid="refund-limit"
            type="number"
            min={0}
            step="1"
            inputMode="decimal"
            value={draft ?? String(limit)}
            onChange={(e) => {
              setDraft(e.target.value);
              if (e.target.value !== "") setLimit(Number(e.target.value));
            }}
            onBlur={() => setDraft(null)}
            className="w-32"
          />
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Refunds up to {formatUsd(limit)} go through on their own. Anything
          larger needs your approval.
        </p>
      </section>

      <section>
        <h2 className="font-display mb-3 text-lg font-bold">
          Waiting for your approval
        </h2>
        {waiting.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
            Nothing is waiting. Refunds over the limit will stop here.
          </p>
        ) : (
          <ul className="space-y-3">
            {waiting.map((order) => (
              <li
                key={order.id}
                data-testid="waiting-refund"
                className="border-primary bg-primary/10 flex flex-wrap items-center gap-3 rounded-xl border p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    #{order.id} {order.item}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatUsd(order.amountUsd)} is over the {formatUsd(limit)}{" "}
                    limit. The Refund agent is waiting for you.
                  </p>
                </div>
                <span className="text-lg font-bold">
                  {formatUsd(order.amountUsd)}
                </span>
                <Button onClick={() => decide(order.id, "approved")}>
                  <CheckIcon /> Approve
                </Button>
                <Button
                  variant="outline"
                  onClick={() => decide(order.id, "rejected")}
                >
                  <XIcon /> Reject
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">
            {CUSTOMER}&apos;s orders
          </h2>
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcwIcon /> Reset demo
          </Button>
        </div>
        <ul className="bg-card divide-y rounded-xl border">
          {state.orders.map((order) => (
            <li
              key={order.id}
              data-testid="order"
              className="flex items-center gap-3 px-4 py-3 text-sm"
            >
              <span className="text-muted-foreground font-mono">
                #{order.id}
              </span>
              <span className="flex-1 font-semibold">{order.item}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  STATUS[order.status].className,
                )}
              >
                {STATUS[order.status].label}
              </span>
              <span className="w-16 text-right font-mono">
                {formatUsd(order.amountUsd)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
