import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MigrationStatusItem } from "../../components/MigrationStatusItem";

describe("MigrationStatusItem", () => {
  it("allows failed record IDs and error messages to be selected", () => {
    render(
      <div style={{ userSelect: "none" }}>
        <MigrationStatusItem
          entityLogicalName="account"
          targetName="Contoso · QC"
          job={{
            status: "completed",
            processed: 1,
            total: 1,
            succeeded: 0,
            created: 0,
            updated: 0,
            failed: 1,
            errors: [
              {
                recordId: "83b129f1-7790-4ca5-a0db-bf02fd67c127",
                message: "The account could not be created.",
              },
            ],
          }}
        />
      </div>,
    );

    const statusButton = screen.getByRole("button", { name: /account → Contoso · QC.*1 failed/i });
    fireEvent.click(statusButton);

    expect(statusButton.nextElementSibling).toHaveStyle({ userSelect: "text" });
    expect(screen.getByText("83b129f1-7790-4ca5-a0db-bf02fd67c127")).toBeVisible();
    expect(screen.getByText("The account could not be created.")).toBeVisible();
  });

  it("shows how many records were created and how many were updated", () => {
    render(
      <MigrationStatusItem
        entityLogicalName="account"
        targetName="Contoso · QC"
        job={{
          status: "completed",
          processed: 5,
          total: 5,
          succeeded: 5,
          created: 3,
          updated: 2,
          failed: 0,
          errors: [],
        }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "✓ account → Contoso · QC: 3 created · 2 updated" }),
    ).toBeVisible();
  });

  it("shows created and updated counts while a migration runs", () => {
    render(
      <MigrationStatusItem
        entityLogicalName="account"
        targetName="Contoso · QC"
        job={{
          status: "running",
          processed: 4,
          total: 10,
          succeeded: 3,
          created: 1,
          updated: 2,
          failed: 1,
          errors: [],
        }}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "⟳ account → Contoso · QC 4/10 · 1 created · 2 updated · 1 failed",
      }),
    ).toBeVisible();
  });
});
