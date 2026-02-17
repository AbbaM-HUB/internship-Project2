export default {
  // 1. Initial Webhook Receiver (The Entry Point)
  async fetch(request: Request, env: any) {
    if (request.method !== "POST") return new Response("Worker is Live", { status: 200 });

    let payload: any;
    try {
      payload = await request.json();
    } catch (e) {
      return new Response("Invalid JSON", { status: 400 });
    }

    try {
      // REQUIREMENT #1 & #2: Immediate Sync attempt
      await this.processSync(payload, env);

      // REQUIREMENT #5: Log Success to DB
      await this.logOperation(payload.type, "SUCCESS", env);

      return new Response("Synced Successfully", { status: 200 });
    } catch (err) {
      console.error("Sync failed, sending to queue:", err);

      // REQUIREMENT #5: Log that we are retrying
      await this.logOperation(payload.type, "RETRYING", env);

      // REQUIREMENT #3: Push to Cloudflare Queue for automatic backoff
      await env.RETRY_QUEUE.send(payload);

      return new Response("Queued for Retry", { status: 202 });
    }
  },

  // 2. Queue Consumer (The Retry Engine)
  async queue(batch: MessageBatch<any>, env: any) {
    for (const message of batch.messages) {
      try {
        await this.processSync(message.body, env);
        // Log successful retry
        await this.logOperation(message.body.type, "SUCCESS_AFTER_RETRY", env);
        message.ack(); // Remove from queue
      } catch (err) {
        // Log failure and tell Cloudflare to retry again based on backoff
        await this.logOperation(message.body.type, "RETRY_FAILED", env);
        message.retry();
      }
    }
  },

  // 3. Core Logic: Transformation & DB Writing
  async processSync(payload: any, env: any) {
    const type = payload.type;
    const student = payload.record || payload.old_record;

    if (!student || !student.id) {
      console.warn("Skipping record: No ID found."); // REQUIREMENT #4
      return;
    }

    if (type === "DELETE") {
      const res = await fetch(`${env.TARGET_DB_URL}/rest/v1/students?id=eq.${student.id}`, {
        method: "DELETE",
        headers: {
          "apikey": env.TARGET_DB_KEY,
          "Authorization": `Bearer ${env.TARGET_DB_KEY}`
        }
      });
      if (!res.ok) throw new Error("Delete failed");
    } else {
      // Transformation Logic
      const transformedData = {
        id: student.id,
        student_data: {
          fullName: `${student.fname || "Unknown"} ${student.lname || ""}`.trim(),
          email: student.email || "No Email",
          sync_info: {
            origin: "Source_Project_A",
            engine: "Queue_Processor_v1",
            processed_at: new Date().toISOString()
          }
        }
      };

      const res = await fetch(`${env.TARGET_DB_URL}/rest/v1/students`, {
        method: "POST",
        headers: {
          "apikey": env.TARGET_DB_KEY,
          "Authorization": `Bearer ${env.TARGET_DB_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates" // Handles INSERT vs UPDATE automatically
        },
        body: JSON.stringify(transformedData)
      });
      if (!res.ok) throw new Error("Upsert failed");
    }
  },

  // 4. Log Function (Requirement #5)
  async logOperation(type: string, status: string, env: any) {
    try {
      await fetch(`${env.TARGET_DB_URL}/rest/v1/sync_logs`, {
        method: "POST",
        headers: {
          "apikey": env.TARGET_DB_KEY,
          "Authorization": `Bearer ${env.TARGET_DB_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          operation_type: type,
          status: status
        })
      });
    } catch (e) {
      console.error("Critical: Logging to sync_logs failed", e);
    }
  }
}