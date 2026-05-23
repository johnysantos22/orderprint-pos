import { createFileRoute } from "@tanstack/react-router";

import { CashierDashboardPage } from "@/features/cashier/CashierDashboardPage";

export const Route = createFileRoute("/caixa")({
  component: CashierDashboardPage,
  head: () => ({
    meta: [{ title: "Painel de Controle - Pizzaria 2 Irmãos" }],
  }),
});
