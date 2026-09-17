import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

export const httpServer = setupServer(
  http.get("http://localhost/api/plugin-registration/capabilities", () =>
    HttpResponse.json({
      transactionalCascadeUnregister: {
        supported: false,
        reason: "Transactional cascade unregister is not release-approved yet. Transactional safety has not yet been proven.",
      },
    })),
  http.get("http://localhost/api/plugin-registration/step-filters/:filterId/metadata", ({ params }) =>
    HttpResponse.json({
      filterId: params.filterId,
      primaryIdAttribute: "accountid",
      availableAttributes: ["accountid", "name"],
    })),
);
