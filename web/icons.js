// Stroke icons (24px grid). Tool kinds come from app/stream.cjs describe().
const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const ICON = {
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  send: svg('<path d="M4 12l16-8-6 16-2.5-6.5z"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="3"/>'),
  out: svg('<path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z"/>'),
  go: svg('<path d="M9 6l6 6-6 6"/>'),
  trash: svg('<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>'),
  read: svg('<path d="M4 6c3-1.5 5.5-1.5 8 0v13c-2.5-1.5-5-1.5-8 0zM12 6c2.5-1.5 5-1.5 8 0v13c-3-1.5-5.5-1.5-8 0"/>'),
  edit: svg('<path d="M15 5l4 4L9 19H5v-4z"/>'),
  run: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 10l3 2-3 2M12 15h4"/>'),
  search: svg('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>'),
  web: svg('<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16"/>'),
  todo: svg('<path d="M9 7h11M9 12h11M9 17h11M4 7h1M4 12h1M4 17h1"/>'),
  tool: svg('<path d="M14 6a4 4 0 0 0 4.5 5.5L11 19a2 2 0 0 1-3-3l7.5-7.5A4 4 0 0 0 14 6z"/>'),
};
