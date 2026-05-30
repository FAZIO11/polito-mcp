// Single source of truth for site-wide constants, so the MCP URL / repo links
// live in one place and never drift between the landing page and the docs.
export const site = {
  name: "polito-mcp",
  tagline: "Your Politecnico di Torino account, spoken to in plain language.",
  description:
    "An open-source MCP server that connects Claude, Cursor, and other AI clients to the Politecnico di Torino student API — grades, lectures, deadlines, course materials, exam booking, free rooms, and more, all from a chat.",
  mcpUrl: "https://polito-mcp.fly.dev/mcp",
  origin: "https://polito-mcp.fly.dev",
  repo: "https://github.com/FAZIO11/polito-mcp",
  author: "Fazil Abdul Sathar",
  authorId: "s334745",
} as const;

export type NavLink = { label: string; href: string };

export const navLinks: NavLink[] = [
  { label: "Features", href: "/#features" },
  { label: "Examples", href: "/#examples" },
  { label: "Security", href: "/#security" },
  { label: "Docs", href: "/docs/" },
];
