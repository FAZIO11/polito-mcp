// Sidebar structure for the docs section. Order here is the order shown.
export type DocItem = { label: string; href: string };
export type DocGroup = { title: string; items: DocItem[] };

export const docsNav: DocGroup[] = [
  {
    title: "Getting started",
    items: [
      { label: "Overview", href: "/docs/" },
      { label: "Quickstart", href: "/docs/quickstart/" },
      { label: "Connecting clients", href: "/docs/clients/" },
    ],
  },
  {
    title: "Reference",
    items: [
      { label: "Tools", href: "/docs/tools/" },
      { label: "Security & privacy", href: "/docs/security/" },
      { label: "Roadmap", href: "/docs/roadmap/" },
    ],
  },
  {
    title: "Help",
    items: [{ label: "FAQ", href: "/docs/faq/" }],
  },
];

// Flat order used to compute previous / next links at the bottom of a page.
export const docsFlat: DocItem[] = docsNav.flatMap((g) => g.items);
