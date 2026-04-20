import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ExpandableMenu from "./ExpandableMenu";
import type { MenuNode } from "@/services/sidebarMenuService";

const makeNode = (overrides: Partial<MenuNode> = {}): MenuNode => ({
  id: "n1",
  title: "Parent",
  icon: null,
  route: "/parent",
  parent_id: null,
  role_access: [],
  order_index: 0,
  is_active: true,
  section: "shop",
  badge_key: null,
  children: [],
  ...overrides,
});

const renderUI = (node: MenuNode) =>
  render(
    <MemoryRouter>
      <ExpandableMenu node={node} />
    </MemoryRouter>,
  );

describe("ExpandableMenu", () => {
  it("renders as leaf when no children", () => {
    renderUI(makeNode());
    expect(screen.getByText("Parent")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders expandable button when children exist, collapsed by default", () => {
    renderUI(
      makeNode({
        children: [makeNode({ id: "c1", title: "Child", route: "/c1" })],
      }),
    );
    const btn = screen.getByRole("button", { name: /Parent/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("toggles aria-expanded on click", () => {
    renderUI(
      makeNode({
        children: [makeNode({ id: "c1", title: "Child", route: "/c1" })],
      }),
    );
    const btn = screen.getByRole("button", { name: /Parent/i });
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("shows child count badge", () => {
    renderUI(
      makeNode({
        children: [
          makeNode({ id: "c1", title: "C1" }),
          makeNode({ id: "c2", title: "C2" }),
          makeNode({ id: "c3", title: "C3" }),
        ],
      }),
    );
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
