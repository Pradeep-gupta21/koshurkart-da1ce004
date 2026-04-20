import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SidebarError from "./SidebarError";

describe("SidebarError", () => {
  it("renders the default message and an alert role", () => {
    render(<SidebarError onRetry={() => {}} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Couldn't load menu/i)).toBeInTheDocument();
  });

  it("renders a custom message when provided", () => {
    render(<SidebarError onRetry={() => {}} message="Network is offline" />);
    expect(screen.getByText("Network is offline")).toBeInTheDocument();
  });

  it("invokes onRetry when the retry button is clicked", () => {
    const onRetry = vi.fn();
    render(<SidebarError onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
