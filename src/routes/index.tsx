import { createFileRoute } from "@tanstack/react-router";

import { CustomerOrderPage } from "@/features/customer/CustomerOrderPage";

export const Route = createFileRoute("/")({
  component: CustomerOrderPage,
  head: () => ({
    meta: [
      { title: "Pizzaria 2 Irmãos - Catálogo Digital" },
      {
        name: "description",
        content: "Catálogo digital para pedidos da Pizzaria 2 Irmãos.",
      },
    ],
  }),
});
