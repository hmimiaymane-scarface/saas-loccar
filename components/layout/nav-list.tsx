import type { NavItem as NavItemType } from "@/lib/navigation"
import { NavItem } from "@/components/layout/nav-item"

interface NavListProps {
  items: NavItemType[]
  collapsed?: boolean
  onNavigate?: () => void
}

function NavList({ items, collapsed, onNavigate }: NavListProps) {
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => (
        <NavItem
          key={item.href}
          item={item}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  )
}

export { NavList }
