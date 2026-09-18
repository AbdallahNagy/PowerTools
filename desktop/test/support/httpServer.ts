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
      displayName: "Account",
      logicalName: "account",
      attributes: [
        { logicalName: "accountid", displayName: "Account", attributeType: "Uniqueidentifier", isPrimaryId: true },
        { logicalName: "name", displayName: "Account Name", attributeType: "String", isPrimaryId: false },
      ],
    })),
  http.get("http://localhost/api/metadata/entities", () =>
    HttpResponse.json([
      { logicalName: "account", displayName: "Account", primaryIdAttribute: "accountid", primaryNameAttribute: "name", isCustom: false },
      { logicalName: "contact", displayName: "Contact", primaryIdAttribute: "contactid", primaryNameAttribute: "fullname", isCustom: false },
      { logicalName: "lead", displayName: "Lead", primaryIdAttribute: "leadid", primaryNameAttribute: "subject", isCustom: false },
    ])),
);
