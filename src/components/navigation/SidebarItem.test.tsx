import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Home } from "lucide-react";
import SidebarItem from "./SidebarItem";

const renderAt = (path: string, ui: React.ReactElement) =>
  render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

describe("SidebarItem", () => {
  it("renders label and icon", () => {
    renderAt("/", <SidebarItem to="/foo" label="Foo" icon={Home} />);
    expect(screen.getByText("Foo")).toBeInTheDocument();
  });

  it("marks itself active on matching route", () => {
    renderAt("/foo", <SidebarItem to="/foo" label="Foo" end />);
    const link = screen.getByRole("link", { name: /foo/i });
    expect(link.className).toMatch(/text-primary/);
  });

  it("renders badge when > 0", () => {
    renderAt("/", <SidebarItem to="/x" label="X" badge={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("caps badge at 99+", () => {
    renderAt("/", <SidebarItem to="/x" label="X" badge={150} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("hides badge when 0", () => {
    renderAt("/", <SidebarItem to="/x" label="X" badge={0} />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
