import { createRouter } from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";
import { DefaultErrorComponent } from "@/app/DefaultErrorComponent";

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
  });

  return router;
};
