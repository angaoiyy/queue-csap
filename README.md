<a href="https://demo-nextjs-with-supabase.vercel.app/">
  <img alt="Next.js and Supabase Starter Kit - the fastest way to build apps with Next.js and Supabase" src="https://demo-nextjs-with-supabase.vercel.app/opengraph-image.png">
  <h1 align="center">Next.js and Supabase Starter Kit</h1>
</a>

<p align="center">
 The fastest way to build apps with Next.js and Supabase
</p>

<p align="center">
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#demo"><strong>Demo</strong></a> ·
  <a href="#deploy-to-vercel"><strong>Deploy to Vercel</strong></a> ·
  <a href="#clone-and-run-locally"><strong>Clone and run locally</strong></a> ·
  <a href="#feedback-and-issues"><strong>Feedback and issues</strong></a>
  <a href="#more-supabase-examples"><strong>More Examples</strong></a>
</p>
<br/>

## Features

- Works across the entire [Next.js](https://nextjs.org) stack
  - App Router
  - Pages Router
  - Proxy
  - Client
  - Server
  - It just works!
- supabase-ssr. A package to configure Supabase Auth to use cookies
- Password-based authentication block installed via the [Supabase UI Library](https://supabase.com/ui/docs/nextjs/password-based-auth)
- Styling with [Tailwind CSS](https://tailwindcss.com)
- Components with [shadcn/ui](https://ui.shadcn.com/)
- Optional deployment with [Supabase Vercel Integration and Vercel deploy](#deploy-your-own)
  - Environment variables automatically assigned to Vercel project

## Demo

You can view a fully working demo at [demo-nextjs-with-supabase.vercel.app](https://demo-nextjs-with-supabase.vercel.app/).

## Deploy to Vercel

Vercel deployment will guide you through creating a Supabase account and project.

After installation of the Supabase integration, all relevant environment variables will be assigned to the project so the deployment is fully functioning.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-supabase&project-name=nextjs-with-supabase&repository-name=nextjs-with-supabase&demo-title=nextjs-with-supabase&demo-description=This+starter+configures+Supabase+Auth+to+use+cookies%2C+making+the+user%27s+session+available+throughout+the+entire+Next.js+app+-+Client+Components%2C+Server+Components%2C+Route+Handlers%2C+Server+Actions+and+Middleware.&demo-url=https%3A%2F%2Fdemo-nextjs-with-supabase.vercel.app%2F&external-id=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-supabase&demo-image=https%3A%2F%2Fdemo-nextjs-with-supabase.vercel.app%2Fopengraph-image.png)

The above will also clone the Starter kit to your GitHub, you can clone that locally and develop locally.

If you wish to just develop locally and not deploy to Vercel, [follow the steps below](#clone-and-run-locally).

## Clone and run locally

1. You'll first need a Supabase project which can be made [via the Supabase dashboard](https://database.new)

2. Create a Next.js app using the Supabase Starter template npx command

   ```bash
   npx create-next-app --example with-supabase with-supabase-app
   ```

   ```bash
   yarn create next-app --example with-supabase with-supabase-app
   ```

   ```bash
   pnpm create next-app --example with-supabase with-supabase-app
   ```

3. Use `cd` to change into the app's directory

   ```bash
   cd with-supabase-app
   ```

4. Rename `.env.example` to `.env.local` and update the following:

  ```env
  NEXT_PUBLIC_SUPABASE_URL=[INSERT SUPABASE PROJECT URL]
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=[INSERT SUPABASE PROJECT API PUBLISHABLE OR ANON KEY]
  ```
  > [!NOTE]
  > This example uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, which refers to Supabase's new **publishable** key format.
  > Both legacy **anon** keys and new **publishable** keys can be used with this variable name during the transition period. Supabase's dashboard may show `NEXT_PUBLIC_SUPABASE_ANON_KEY`; its value can be used in this example.
  > See the [full announcement](https://github.com/orgs/supabase/discussions/29260) for more information.

  Both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` can be found in [your Supabase project's API settings](https://supabase.com/dashboard/project/_?showConnect=true)

5. You can now run the Next.js local development server:

   ```bash
   npm run dev
   ```

   The starter kit should now be running on [localhost:3000](http://localhost:3000/).

6. This template comes with the default shadcn/ui style initialized. If you instead want other ui.shadcn styles, delete `components.json` and [re-install shadcn/ui](https://ui.shadcn.com/docs/installation/next)

> Check out [the docs for Local Development](https://supabase.com/docs/guides/getting-started/local-development) to also run Supabase locally.

### ScreenBased Reservation Feature

To enable the queue reservation system, run the SQL migration in your Supabase project:

1. Open [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql/new)
2. Copy and run the contents of `supabase/migrations/001_create_reservations.sql`
3. (Optional) For live queue updates on the display and admin screens, enable Realtime for the `reservations` table in **Database > Replication**

### Daily window quotas

The current frontend uses API polling. If migration 034 was applied fully or partially, run `035_restore_api_polling.sql` to roll back that optimization. Migration 035 is also safe on a database already at 033, and safe to rerun. It preserves reservations, quotas, windows, staff assignments, and ownership protections while removing only 034's derived metadata and helper RPCs. Keep migrations 032 and 033 for the quota and exclusive-window features.

On an office's queue dashboard, first select an available window to claim it. Then choose **Configure Quotas**, enable its quota, and enter today's periods and positive whole-number limits. Staff can configure only their currently claimed window. Times use `Asia/Manila`; periods include their start and exclude their end. Quotas expire at midnight and must be configured again for the next day.

Only waiting and serving tickets count, including priority tickets and backlog from earlier periods. Completed and skipped tickets free capacity. With a quota enabled, a window accepts new tickets only during configured periods; existing tickets can still be served outside them. Reducing a quota preserves existing tickets. A window cannot be closed while serving a ticket, or when its waiting queue cannot fit within the remaining windows' limits.

Availability is refreshed through the existing server action every five seconds. Window queues refresh every ten seconds. Polling pauses in hidden/offline tabs and scheduled requests do not overlap. PostgreSQL remains authoritative for admission capacity and window ownership. Quota configuration changes are recorded in Activity Logs.

Run `npm run test:quotas` for validation and availability tests. Run `npm run test:quotas:db` with PostgreSQL binaries on `PATH` (or set `PG_BIN` to their directory) for integration and concurrency tests. The database test runner creates a temporary local cluster, applies the complete migration history with a minimal Supabase Auth fixture, and removes the cluster afterward; it does not connect to the configured application database.

### Exclusive staff windows

Each staff account can claim one active window in its office. A window occupied by another staff account is unavailable. Switching claims the new window and releases the previous one atomically; a failed switch preserves the current assignment. Reloading the dashboard restores the claim, and another tab of the same account follows the same assignment.

The dashboard checks assignments and renews its held claim through the existing server action every fifteen seconds while visible and online. Claims expire after two minutes without renewal. **Release Window** and signing out release the claim immediately. Hidden/offline dashboards pause polling; a returning staff member must select an available window again if the previous claim has expired. Unclaimed or expired sessions cannot call, skip, recall, or change a quota. Existing queue tickets stay with their window when an operator switches or releases it.

Queue actions, quota writes, and direct reservation updates enforce ownership in the database. Priority tickets go first within the selected window's queue; dispatch never pulls a ticket from another window. Recall announcements are written by the authorized database RPC to `window_recalls`; displays read the latest recall nonce while polling every five seconds and announce changes after the initial load. Staff can view and operate their selected window's queue. Shared window-count and display controls are limited to the super admin; even the super admin must claim a window to operate its queue or quota. A window with a live staff claim cannot be closed until released or expired.

The database test suite also checks claim conflicts, concurrent switches, failed-switch rollback, direct-write restrictions, stale tabs, heartbeat renewal, expiry, and authenticated recall events.

### API polling and rollback

The dashboard, quota forms, display, and activity-log UI use periodic API reads instead of Supabase Realtime channels. Display updates and recall announcements may take up to five seconds; window occupancy may take up to fifteen seconds to refresh. All mutations still validate the current state in PostgreSQL, so a stale browser view cannot steal an occupied window or exceed a quota.

Apply `035_restore_api_polling.sql` to the application database and reload the frontend to finish the rollback. It restores migration 033's combined assignment read/renew behavior and removes migration 034's optimization tables, triggers, helper functions, and added quota publication membership in one transaction. The historical 034 migration remains in source control so the upgrade/rollback sequence is reproducible. Run `npm run test:quotas` for quota validation and `npm run test:quotas:db` for integration, concurrency, and rollback preservation tests.

## Feedback and issues

Please file feedback and issues over on the [Supabase GitHub org](https://github.com/supabase/supabase/issues/new/choose).

## More Supabase examples

- [Next.js Subscription Payments Starter](https://github.com/vercel/nextjs-subscription-payments)
- [Cookie-based Auth and the Next.js 13 App Router (free course)](https://youtube.com/playlist?list=PL5S4mPUpp4OtMhpnp93EFSo42iQ40XjbF)
- [Supabase Auth and the Next.js App Router](https://github.com/supabase/supabase/tree/master/examples/auth/nextjs)
