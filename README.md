# Student Sync Engine

A resilient Data Synchronization and ETL (Extract, Transform, Load) pipeline that bridges two decoupled Supabase projects with built-in retry logic.

##  Features
- **Instant Sync**: Database Webhooks trigger immediate data migration upon Inserts/Updates/Deletes.
- **Data Transformation**: Converts flat relational SQL rows into structured JSONB documents.
- **Guaranteed Delivery**: Uses Cloudflare Queues for automatic retries with exponential backoff.
- **Observability**: Custom `sync_logs` table provides a full audit trail of every transaction.

##  Tech Stack
- **Runtime**: Cloudflare Workers (Serverless).
- **Messaging**: Cloudflare Queues.
- **Database**: Supabase (PostgreSQL).
- **Communication**: REST API + Webhooks.

##  Architecture
When a record is modified in the Source DB, a Webhook notifies the Worker. The Worker transforms the data and pushes it to the Target DB. If the Target is unreachable, the payload is moved to a **Cloudflare Queue** for resilient retrying.

##  Load Test Results
- **Concurrency**: Handled 200+ simultaneous requests.
- **Error Rate**: 0% during burst load.
- **Latency**: 0.79ms Median CPU time.

##  Setup
1. Clone the repository.
2. Configure `wrangler.jsonc` with your `TARGET_DB_URL` and `TARGET_DB_KEY`.
3. Create the `sync_retries` queue: `npx wrangler queues create sync-retries`.
4. Deploy: `npx wrangler deploy`.
