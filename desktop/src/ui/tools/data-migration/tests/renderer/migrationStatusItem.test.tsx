import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MigrationStatusItem } from "../../components/MigrationStatusItem";

describe("MigrationStatusItem", () => {
  it("allows failed record IDs and error messages to be selected", () => {
    render(
      <div style={{ userSelect: "none" }}>
        <MigrationStatusItem
          entityLogicalName="account"
          job={{
            status: "completed",
            processed: 1,
            total: 1,
            succeeded: 0,
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

    const statusButton = screen.getByRole("button", { name: /account.*1 failed/i });
    fireEvent.click(statusButton);

    expect(statusButton.nextElementSibling).toHaveStyle({ userSelect: "text" });
    expect(screen.getByText("83b129f1-7790-4ca5-a0db-bf02fd67c127")).toBeVisible();
    expect(screen.getByText("The account could not be created.")).toBeVisible();
  });
});
