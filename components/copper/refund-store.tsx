"use client";

// The Support page's refund state, shared by the Refund Console (left) and
// Ask Copper (right): the auto-refund limit and the customer's orders. It
// lives in the browser (and localStorage, so a refresh keeps it). The chat
// sends it with each message, and applies what the Refund agent's
// request_refund tool decided. Approve and Reject happen here, by a person.
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  cleanLimit,
  DEFAULT_LIMIT_USD,
  type Order,
  type OrderStatus,
  type RefundDecision,
  type RefundState,
  STARTING_ORDERS,
  statusAfter,
} from "@/lib/copper/refunds";

const STORAGE_KEY = "copper-refunds-v1";

export type PersonDecision = "approved" | "rejected";
type Announcer = (decision: PersonDecision, order: Order) => void;

type RefundStore = {
  state: RefundState;
  setLimit: (value: number) => void;
  /** Applies what request_refund decided (refunded, or waiting). */
  applyDecision: (decision: RefundDecision) => void;
  /** A person's Approve or Reject in the console. */
  decide: (orderId: string, decision: PersonDecision) => void;
  reset: () => void;
  /** The chat registers how to tell the customer about a decision. */
  setAnnouncer: (announce: Announcer | null) => void;
};

const Context = createContext<RefundStore | null>(null);

/** The refund state, or null outside the Support page. */
export function useRefunds() {
  return useContext(Context);
}

const START: RefundState = {
  limitUsd: DEFAULT_LIMIT_USD,
  orders: STARTING_ORDERS,
};

export function RefundProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RefundState>(START);
  const loaded = useRef(false);
  const announcer = useRef<Announcer | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved && Array.isArray(saved.orders))
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage after hydration
        setState({
          limitUsd: cleanLimit(saved.limitUsd),
          orders: saved.orders,
        });
    } catch {
      // No saved state: start fresh.
    }
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage blocked: the console still works for this visit.
    }
  }, [state]);

  const setStatus = useCallback((id: string, status: OrderStatus) => {
    setState((s) => ({
      ...s,
      orders: s.orders.map((o) => (o.id === id ? { ...o, status } : o)),
    }));
  }, []);

  const store = useMemo<RefundStore>(
    () => ({
      state,
      setLimit: (value) =>
        setState((s) => ({ ...s, limitUsd: cleanLimit(value) })),
      applyDecision: (decision) => {
        const status = statusAfter(decision);
        if (status) setStatus(decision.orderId, status);
      },
      decide: (orderId, decision) => {
        const order = state.orders.find((o) => o.id === orderId);
        if (!order || order.status !== "waiting") return;
        setStatus(orderId, decision === "approved" ? "refunded" : "rejected");
        announcer.current?.(decision, order);
      },
      reset: () => setState(START),
      setAnnouncer: (announce) => {
        announcer.current = announce;
      },
    }),
    [state, setStatus],
  );

  return <Context.Provider value={store}>{children}</Context.Provider>;
}
