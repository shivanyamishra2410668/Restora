# Restora

Restora is a vanilla JavaScript/Vite multi-tenant restaurant operations app backed by Supabase. This workspace is connected to the Restora Supabase project through `.env.local`.

## Run locally

1. Install Node.js 20 or newer.
2. From the project folder run `npm install`.
3. Copy `.env.example` to `.env.local` and set the Supabase project URL and publishable (anon) key from Project Settings → API. Set `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET` for product image uploads.
4. In Supabase SQL Editor, apply every SQL migration in `supabase/migrations` in filename order.
5. In Authentication → URL Configuration, allow your local URL (for example `http://localhost:5173/**`) and set the site URL.
6. Run `npm run dev`, then open the URL Vite prints.

The browser bundle only reads the public key. Never add `service_role` keys to `.env.local` or frontend files. Email confirmation is currently disabled in the connected Supabase project as requested. The auth trigger records an owner application during signup.

Product photos upload directly to Cloudinary using an unsigned upload preset. Supabase stores the gallery in `products.image_urls` and keeps the cover in `products.image_url`; the customer menu cycles through gallery photos and each dish opens a full detail view. Apply `202611180001_product_photo_galleries.sql` in Supabase SQL Editor before using the gallery editor. Never put a Cloudinary API secret in browser code.

## First Super Admin

The requested platform administrator is `2k24.cs1o.2410668@gmail.com`. It has been provisioned in `public.super_admins`. For another project, create the Auth user first, then run `supabase/bootstrap_super_admin.sql` in SQL Editor. There is no public browser operation that can grant this role. Keep SQL Editor access restricted to trusted project administrators.

## Application map

- `/` marketing page
- `/login.html`, `/register.html`, `/forgot-password.html` shared auth flows
- `/workspace.html` workspace picker for multiple memberships
- `/restaurant/*`, `/super-admin/*`, `/kitchen/*`, `/waiter/*`, `/customer/*` protected role routes (Vite serves the common entry module for these paths)
- `js/config`, `js/auth`, and `js/services` contain Supabase setup, trusted membership lookup, and data access.
- `supabase/migrations` contains schema, indexes, triggers, role helpers, application approval RPC, and RLS policies.

## Implemented in this workspace

- Shared Supabase email/password authentication, profile provisioning, password reset, persisted sessions, logout and membership-based dashboard routing.
- Restaurant owner application submission with pending state; super-admin approval/rejection RPC provisions the restaurant, owner membership and Free subscription.
- The platform super admin can review onboarding requests and view every restaurant profile with operational totals. Approving an application activates the restaurant and grants its owner membership, which unlocks the restaurant management dashboard on the owner's next login.
- Tenant-scoped PostgreSQL entities for menus, orders, tables, stock, reservations, reviews, subscriptions, payments and audit records, with RLS enabled and policies defined.
- Live database counts and list/add/delete/status-update flows for the currently wired management views. Kitchen order updates subscribe to Supabase Realtime.
- Restaurant owners and managers can assign existing Restora accounts as managers, kitchen staff, or waiters. Staff can register first, then the restaurant admin adds them from Employees.
- Kitchen staff sign in through the shared `/login.html` page and are routed to a role-checked kitchen panel. Restaurant owners/managers forward pending orders to the kitchen; kitchen staff advance tickets through preparing and ready using guarded database RPCs.
- Restaurant owners/managers can generate a downloadable QR code for each table. Guests can scan it without signing in, browse available menu items, and submit a dine-in order linked to the scanned table; restaurant Orders shows the table number, items, guest name, and total.
- Responsive landing page and shared light/dark dashboard/auth design system.

## Remaining integration work

This is a runnable foundation, not a production SaaS deployment. The current project migrations and admin assignment were applied to Supabase. Staff access currently requires the staff member to register an account before an owner or manager assigns a restaurant role; email invitations through a trusted Edge Function remain future work. Other workflows still need implementation before claiming full coverage: product image upload and storage policies, transactional customer checkout/order pricing, payment-provider verification, table assignment/reservation UI, full customer cart/menu/review flows, complete admin user/subscription editing, charts/reports, invoice printing, and end-to-end RLS tests. The UI intentionally does not report online payments as paid.

## Security notes

- `super_admins` has no client write policy. Bootstrap via trusted SQL Editor only.
- Tenant reads and writes depend on active restaurant memberships and active restaurant status. The super-admin role does not bypass tenant RLS; a guarded read-only database function returns restaurant profiles and operational counts only to provisioned super admins. Client role and URL values are not used to authorize access.
- Owner applications are created in a `SECURITY DEFINER` auth trigger from signup metadata; users can only read their own application. Approval is restricted to the database allowlist and runs as `review_restaurant_application`.
- The Supabase service role is never used in the frontend. For invitations, payment webhooks, and other privileged actions, add server-side Edge Functions with secrets stored in Supabase.
- Before launch, review the migration against your Supabase PostgreSQL version, configure backups, SMTP, allowed origins, and Storage policy, then run the checklist against a staging project.

## Release checklist

- [x] Add project URL and publishable key; apply migrations.
- [x] Bootstrap the requested super admin using SQL Editor.
- [ ] Verify email confirmation, password reset and all role redirects.
- [ ] Exercise owner approval and suspended/pending access.
- [ ] Test cross-restaurant reads/writes with separate accounts, including direct REST requests.
- [ ] Verify order totals and status transitions on trusted server-side paths before taking real payments.
- [ ] Configure Storage, staff invitation Edge Function, SMTP and deployment domain.
- [ ] `npm run build` and browser-check desktop/mobile routes against staging.
