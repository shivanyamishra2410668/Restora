import Activity from 'lucide/dist/esm/icons/activity.js';
import ArrowLeft from 'lucide/dist/esm/icons/arrow-left.js';
import ArrowRight from 'lucide/dist/esm/icons/arrow-right.js';
import ArrowUpRight from 'lucide/dist/esm/icons/arrow-up-right.js';
import BadgeCheck from 'lucide/dist/esm/icons/badge-check.js';
import Bell from 'lucide/dist/esm/icons/bell.js';
import Boxes from 'lucide/dist/esm/icons/boxes.js';
import CalendarDays from 'lucide/dist/esm/icons/calendar-days.js';
import Check from 'lucide/dist/esm/icons/check.js';
import ChefHat from 'lucide/dist/esm/icons/chef-hat.js';
import ChevronDown from 'lucide/dist/esm/icons/chevron-down.js';
import CircleCheck from 'lucide/dist/esm/icons/circle-check.js';
import CircleHelp from 'lucide/dist/esm/icons/circle-help.js';
import Clock3 from 'lucide/dist/esm/icons/clock-3.js';
import CreditCard from 'lucide/dist/esm/icons/credit-card.js';
import FileText from 'lucide/dist/esm/icons/file-text.js';
import Flame from 'lucide/dist/esm/icons/flame.js';
import Grid2X2 from 'lucide/dist/esm/icons/grid-2x2.js';
import History from 'lucide/dist/esm/icons/history.js';
import LayoutDashboard from 'lucide/dist/esm/icons/layout-dashboard.js';
import ListOrdered from 'lucide/dist/esm/icons/list-ordered.js';
import LoaderCircle from 'lucide/dist/esm/icons/loader-circle.js';
import LogOut from 'lucide/dist/esm/icons/log-out.js';
import Mail from 'lucide/dist/esm/icons/mail.js';
import MapPin from 'lucide/dist/esm/icons/map-pin.js';
import Minus from 'lucide/dist/esm/icons/minus.js';
import Package from 'lucide/dist/esm/icons/package.js';
import PackageCheck from 'lucide/dist/esm/icons/package-check.js';
import Plus from 'lucide/dist/esm/icons/plus.js';
import QrCode from 'lucide/dist/esm/icons/qr-code.js';
import Receipt from 'lucide/dist/esm/icons/receipt.js';
import Search from 'lucide/dist/esm/icons/search.js';
import Settings from 'lucide/dist/esm/icons/settings.js';
import ShoppingBag from 'lucide/dist/esm/icons/shopping-bag.js';
import ShoppingCart from 'lucide/dist/esm/icons/shopping-cart.js';
import SlidersHorizontal from 'lucide/dist/esm/icons/sliders-horizontal.js';
import Sparkles from 'lucide/dist/esm/icons/sparkles.js';
import Store from 'lucide/dist/esm/icons/store.js';
import Table2 from 'lucide/dist/esm/icons/table-2.js';
import Tags from 'lucide/dist/esm/icons/tags.js';
import Trash2 from 'lucide/dist/esm/icons/trash-2.js';
import Truck from 'lucide/dist/esm/icons/truck.js';
import UserRound from 'lucide/dist/esm/icons/user-round.js';
import UsersRound from 'lucide/dist/esm/icons/users-round.js';
import Utensils from 'lucide/dist/esm/icons/utensils.js';
import UtensilsCrossed from 'lucide/dist/esm/icons/utensils-crossed.js';
import X from 'lucide/dist/esm/icons/x.js';

const definitions = {
  activity: Activity, 'arrow-left': ArrowLeft, 'arrow-right': ArrowRight, 'arrow-up-right': ArrowUpRight,
  badge: BadgeCheck, bell: Bell, boxes: Boxes, calendar: CalendarDays, check: Check,
  chef: ChefHat, chevron: ChevronDown, 'circle-check': CircleCheck, help: CircleHelp,
  clock: Clock3, card: CreditCard, file: FileText, flame: Flame, grid: Grid2X2,
  history: History, dashboard: LayoutDashboard, orders: ListOrdered, loader: LoaderCircle,
  logout: LogOut, mail: Mail, location: MapPin, minus: Minus, package: Package,
  'package-check': PackageCheck, plus: Plus, qr: QrCode, receipt: Receipt, search: Search,
  settings: Settings, bag: ShoppingBag, cart: ShoppingCart, filters: SlidersHorizontal,
  sparkle: Sparkles, store: Store, table: Table2, tags: Tags, trash: Trash2,
  truck: Truck, user: UserRound, users: UsersRound, utensils: Utensils,
  'utensils-crossed': UtensilsCrossed, close: X,
};

const escapeAttribute = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function renderNode([tag, attributes, children = []]) {
  const attrs = Object.entries(attributes || {}).map(([name, value]) => `${name}="${escapeAttribute(value)}"`).join(' ');
  return `<${tag}${attrs ? ` ${attrs}` : ''}>${children.map(renderNode).join('')}</${tag}>`;
}

export function svgIcon(name, className = 'icon') {
  const [tag, attributes, children] = definitions[name] || CircleHelp;
  return renderNode([tag, { ...attributes, class: className, 'aria-hidden': 'true', focusable: 'false' }, children]);
}

export function loadingMarkup(label = 'Loading') {
  return `<span class="loading-indicator" role="status">${svgIcon('loader', 'icon loader-icon')}<span>${escapeAttribute(label)}</span></span>`;
}

export function setButtonLoading(button, label = 'Please wait') {
  if (!button) return;
  if (!button.dataset.loadingHtml) {
    button.dataset.loadingHtml = button.innerHTML;
    button.dataset.loadingDisabled = String(button.disabled);
  }
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.innerHTML = `${svgIcon('loader', 'icon loader-icon')}<span>${escapeAttribute(label)}</span>`;
}

export function restoreButton(button, fallback = 'Continue') {
  if (!button) return;
  button.disabled = button.dataset.loadingDisabled === 'true';
  button.removeAttribute('aria-busy');
  button.innerHTML = button.dataset.loadingHtml || fallback;
  delete button.dataset.loadingHtml;
  delete button.dataset.loadingDisabled;
}
