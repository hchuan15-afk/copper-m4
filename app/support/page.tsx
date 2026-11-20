import type { Metadata } from "next";
import { AskCopper } from "@/components/copper/ask-copper";
import { RefundConsole } from "@/components/copper/refund-console";
import { RefundProvider } from "@/components/copper/refund-store";
import { SiteHeader } from "@/components/copper/site-header";
import { isAiConfigured } from "@/lib/ai/call";

export const metadata: Metadata = { title: "Support | Copper State Labs" };

export default function Support() {
  return (
    // Leaves room on the right for the docked chat. The provider shares the
    // orders and the limit between the console and the chat.
    <RefundProvider>
      <div className="flex flex-1 flex-col lg:pr-[28rem]">
        <SiteHeader />
        <main
          data-testid="refund-console"
          className="mx-auto w-full max-w-3xl flex-1 px-4 py-8"
        >
          <h1 className="font-display text-3xl font-bold">Refund Console</h1>
          <RefundConsole />
        </main>
        <AskCopper aiConfigured={isAiConfigured()} docked />
      </div>
    </RefundProvider>
  );
}
