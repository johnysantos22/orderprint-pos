import { createFileRoute } from "@tanstack/react-router";

import { WaiterOrderPage } from "@/features/waiter/WaiterOrderPage";

export const Route = createFileRoute("/garcom")({
  component: WaiterOrderPage,
  head: () => ({
    meta: [{ title: "Garçom - Pizzaria 2 Irmãos" }],
  }),
});
