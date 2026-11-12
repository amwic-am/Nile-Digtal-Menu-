# Nile Table

Restaurant operations app built with React, Express, Socket.IO, and Supabase PostgreSQL/Auth.

## Run locally

1. Create a Supabase project and copy its pooler connection strings from **Connect**. Use the **Transaction pooler** for the app and the **Session pooler** for Prisma CLI operations.
2. Copy `.env.example` to the untracked `.env.local` file in the project root and fill in the values. URL-encode special characters in the database password.
3. Install dependencies and start the app:

   ```sh
   npm install
   npm run dev
   ```

The app's query layer uses `DATABASE_URL`; Prisma CLI reads `DIRECT_URL` for schema operations. Prisma is configured but is not yet used by the app's runtime queries. The API applies `server/db/schema.sql` at startup. On an empty database it seeds restaurant data and a super-admin staff record. Staff identity and sign-in use Supabase Auth; staff roles and active status continue to come from the PostgreSQL `staff` table.

Set `INITIAL_ADMIN_EMAIL` to the intended super-admin email in the ignored environment file. On a successful Supabase login with that exact email, the API can automatically activate and link the existing unique super-admin row, promote an existing row for that email, or create a super-admin row if none exists and a restaurant is already configured. This bootstrap does not run for other Supabase accounts. Alternatively, run `npm run admin:update` after configuring a valid Supabase service-role key. Existing Auth passwords are preserved; to reset one, explicitly set `RESET_ADMIN_PASSWORD=true` along with `INITIAL_ADMIN_PASSWORD`.

To add staff, select a role and use **Send invitation**. The app creates an invited Supabase Auth account, sends an email through Supabase, and stores the selected role in the staff table and Auth user metadata (`staff_role`). Set `AUTH_REDIRECT_URL` to an allowed application URL. If the role should appear in the invitation email body, update Supabase Auth's invite template to include `{{ .Data.staff_role }}`. To invite existing staff missing Auth accounts, run `npm run staff:invite-auth`.

Product photos can be uploaded from **Add a product**. On the first upload, the server creates a public `menu-product-images` Supabase Storage bucket restricted to PNG, JPG, and WebP files up to 6 MB. The bucket is public so customer menu images can load without staff authentication; uploads remain restricted to super-admin and manager accounts through the server.

If Supabase accepts a login but the app reports that the account is not linked to staff, set `INITIAL_ADMIN_EMAIL` to the intended admin login email and `INITIAL_ADMIN_PASSWORD` to a new strong password, then run `npm run admin:update` and sign in again. The API also matches verified Auth IDs to staff rows, so a successful email match is saved for future logins. Restart the API after updating the schema or staff/Auth records.

The browser uses only the Supabase publishable/anon key. Never expose `SUPABASE_SERVICE_ROLE_KEY`, database credentials, or admin passwords through a `VITE_` variable or commit them to source control. Rotate any credentials that have been shared or exposed.

## Deploy on Render

1. Create a **Web Service** on Render connected to this repository.
2. Use these commands:
   - Build: `npm ci && npm run build`
   - Start: `npm start`
3. Set environment variables in Render. Set both `VITE_` variables before the build because Vite embeds them in the frontend bundle:
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = Supabase **Transaction pooler** connection string (include `pgbouncer=true` and `sslmode=require`)
   - `DIRECT_URL` = Supabase **Session pooler** connection string (include `sslmode=require`)
   - `SUPABASE_URL` = project URL
   - `SUPABASE_ANON_KEY` = publishable/anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = service-role key (server environment only)
   - `VITE_SUPABASE_URL` = project URL
   - `VITE_SUPABASE_ANON_KEY` = publishable/anon key
   - `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` = super-admin login to provision
   - `AUTH_REDIRECT_URL` = deployed app URL plus `/login`; add it to Supabase Auth's allowed redirect URLs
4. Set the Render health check path to `/api/health`.
5. After the first deployment, run `npm run admin:update` once with the configured initial admin credentials (or run it locally against the production environment), then sign in with those Supabase Auth credentials. For existing staff, run `npm run staff:invite-auth` to send invitations.

The app serves the built frontend and API from the same web service; Socket.IO uses that service too. Keep database and service-role credentials and `INITIAL_ADMIN_PASSWORD` in the host's secret environment settings. The database connection is server-side and uses the Supabase database password, not a browser anon/publishable key.

This switches the app to Supabase but does not copy existing records from a previous local PGlite database. Export and import that data separately before pointing a production deployment at the new database.

## Scripts

- `npm run dev` — API and Vite development servers
- `npm run build` — type-check and build the frontend
- `npm start` — production API and static frontend server
- `npm run admin:update` — provision/update the active super-admin in Supabase Auth
- `npm run staff:invite-auth` — invite active staff without Supabase Auth accounts
- `npx prisma validate` — validate the Prisma schema and configuration
