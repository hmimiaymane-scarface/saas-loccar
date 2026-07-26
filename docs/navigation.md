# Navigation Architecture

Productization wave 1 phase 4 — "Rebuild the Information Architecture."
Before this phase, `lib/navigation.ts`'s desktop `primaryNav` was 13
items, effectively one per database table (Overview, Calendar,
Reservations, Fleet, Customers, Payments, Expenses, Maintenance,
Documents, Contracts, Contract Templates, Team, Reports), plus a
4-item `secondaryNav` (Website, AI Assistant, Notifications, Settings).
The brief's own "done when": *the main navigation represents daily
actions, not database tables.*

## The new 7-item primary nav

Home, Calendar, New Rental, Fleet, Customers, Money, More — exported
from `lib/navigation.ts#primaryNav`, rendered by `Sidebar` (desktop) and
the (dead-code, see below) `MobileNav` drawer.

## Old → new mapping

| Old nav item | Now lives |
|---|---|
| Overview | Renamed to **Home** — same `/overview` page, unchanged. |
| Calendar | Unchanged, plus a new "View all reservations" link in its header. |
| Reservations | Dropped from every nav. Still a real page (`/reservations` — search/filter/export) — reachable via Calendar's new link. |
| *(new)* | **New Rental** — `/reservations/new` directly, same icon/destination `quick-actions-sheet.tsx` already used for its own "New Rental" quick action. |
| Fleet, Customers | Unchanged. |
| Payments, Expenses | Grouped under **Money** (`/money`, new hub page) — each keeps its own full page; Money just links to both. |
| Maintenance, Documents, Contracts, Contract Templates, Team, Reports, Website, AI Assistant | Grouped under **More** (`/more`, new hub page). |
| Notifications | Not in any nav list, before or after — always reachable via the persistent header bell (`components/layout/notification-bell.tsx`). |
| Settings | Grouped under More as "Advanced settings" (same `/settings` page/URL, unchanged). Also still one click from `UserMenu`, now via a "More" entry instead of a direct "Settings" one. |
| *(new)* | **Activity history** — `/activity` already existed as an unlisted route (reachable only via a "View all" link on the Overview activity-feed card); now also listed under More. |

Both hub pages (`app/(dashboard)/money/page.tsx`,
`app/(dashboard)/more/page.tsx`) reuse the sidebar's own
`NavList`/`NavItem` components (`components/layout/nav-list.tsx`)
rather than a second link-list style — those components have no
dependency on being inside `<aside>`.

## Scoping decisions

- **`mobilePrimaryNav` (the bottom tab bar) is untouched.** It was
  already built phase-16 as a deliberately separate, task-shaped,
  5-slot list (Home/Reservations/Fleet/Customers/Inbox) — the same
  philosophy this phase finally applied to the desktop sidebar. 7 items
  don't fit 5 tabs anyway.
- **Mobile had no reachable path at all** to Documents/Maintenance/
  Reports/Contracts/Contract Templates/Team/Website/Settings before
  this phase — the bottom tabs don't include them and the old hamburger
  drawer (`components/layout/header.tsx`'s `MobileNav`) has been dead
  code since phase 16 replaced it with `MobileShell`'s own compact
  header + bottom tabs (`DesktopShell`'s wrapper is `hidden ... lg:flex`,
  so that drawer's `lg:hidden` trigger button never actually renders on
  a phone). `UserMenu`'s new "More" entry (`components/layout/user-menu.tsx`)
  fixes this — it's reachable from both shells, same as "Profile"
  already was.
- **Money vs. More for Reports**: Reports nests under More, not Money.
  Its own page describes itself as "Business performance over time" —
  broader than the two transactional Payments/Expenses pages — and the
  brief itself lists Reports as a peer of Documents/Maintenance/
  Contracts/Activity/Advanced-settings, all of which go under More.
- **No feature merges.** Money and More are navigation groupings only —
  Payments/Expenses/Documents/Maintenance/etc. all keep their existing
  full pages exactly as they were; nothing here rewrites their internals.
