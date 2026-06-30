// Minimal hash router for a static, multi-view single page.
//
// Views are <section data-view="/path"> elements; nav links are
// <a data-route="/path">. The router shows the section matching the current
// hash, marks the matching link active, and runs any registered onEnter hook
// (used by the lists view to refresh when navigated to).

type RouteHandler = () => void;
type RouteChangeHandler = (route: string) => void;

const HOME_ROUTE = '/';
const onEnterHandlers = new Map<string, RouteHandler>();
const onChangeHandlers: RouteChangeHandler[] = [];

/** Register a callback to run every time `route` becomes active. */
export function onRouteEnter(route: string, handler: RouteHandler): void {
  onEnterHandlers.set(route, handler);
}

/** Register a callback to run on every route change, with the new route. */
export function onRouteChange(handler: RouteChangeHandler): void {
  onChangeHandlers.push(handler);
}

function currentRoute(): string {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw || raw === '/') return HOME_ROUTE;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function setDrawerOpen(open: boolean): void {
  document.body.classList.toggle('nav-open', open);
  document.getElementById('nav-toggle')?.setAttribute('aria-expanded', String(open));
}

function applyRoute(): void {
  const views = Array.from(document.querySelectorAll<HTMLElement>('[data-view]'));
  const requested = currentRoute();
  const known = views.some((view) => view.dataset.view === requested);
  const route = known ? requested : HOME_ROUTE;

  for (const view of views) {
    view.hidden = view.dataset.view !== route;
  }

  for (const link of Array.from(document.querySelectorAll<HTMLElement>('[data-route]'))) {
    link.classList.toggle('is-active', link.dataset.route === route);
  }

  setDrawerOpen(false);
  onEnterHandlers.get(route)?.();
  for (const handler of onChangeHandlers) handler(route);
}

export function initRouter(): void {
  const toggle = document.getElementById('nav-toggle');
  const overlay = document.getElementById('nav-overlay');

  toggle?.addEventListener('click', () => {
    setDrawerOpen(!document.body.classList.contains('nav-open'));
  });
  overlay?.addEventListener('click', () => setDrawerOpen(false));

  for (const link of Array.from(document.querySelectorAll<HTMLElement>('[data-route]'))) {
    link.addEventListener('click', () => setDrawerOpen(false));
  }

  window.addEventListener('hashchange', applyRoute);
  applyRoute();
}
