const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

// =====================================================
// ENVIRONMENT VARIABLES
// =====================================================

const PORT = process.env.PORT || 10000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const EVENT_KEY = "EVENT_A";

// =====================================================
// SUPABASE
// =====================================================

let supabase = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  );
}

// =====================================================
// STARTUP LOG
// =====================================================

console.log("==============================================");
console.log("🎟️ GeitaCard Server inaanza...");
console.log("==============================================");
console.log(`📌 EVENT: ${EVENT_KEY}`);
console.log(`🌐 PORT: ${PORT}`);

console.log(
  `🟢 SUPABASE_URL: ${SUPABASE_URL ? "SET" : "MISSING"}`
);

console.log(
  `🟢 SUPABASE_SERVICE_ROLE_KEY: ${
    SUPABASE_SERVICE_ROLE_KEY ? "SET" : "MISSING"
  }`
);

console.log(
  `🟢 WHATSAPP_TOKEN: ${
    WHATSAPP_TOKEN ? "SET" : "MISSING"
  }`
);

console.log(
  `🟢 VERIFY_TOKEN: ${
    VERIFY_TOKEN ? "SET" : "MISSING"
  }`
);

console.log("==============================================");

// =====================================================
// HOME
// =====================================================

app.get("/", async (req, res) => {
  let databaseStatus = "NOT CONNECTED";

  if (supabase) {
    try {
      const { error } = await supabase
        .from("events")
        .select("id")
        .eq("event_key", EVENT_KEY)
        .limit(1);

      databaseStatus = error
        ? "ERROR"
        : "CONNECTED";
    } catch (err) {
      databaseStatus = "ERROR";
    }
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport"
            content="width=device-width, initial-scale=1.0">
      <title>GeitaCard</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: #f4f6fb;
          padding: 25px;
        }

        .card {
          max-width: 650px;
          margin: auto;
          background: white;
          padding: 25px;
          border-radius: 15px;
          box-shadow: 0 3px 15px rgba(0,0,0,.08);
        }

        .status {
          display: inline-block;
          padding: 8px 12px;
          border-radius: 20px;
          background: #dff5e5;
          color: #238636;
          font-weight: bold;
        }
      </style>
    </head>

    <body>
      <div class="card">
        <h1>🎟️ GeitaCard</h1>

        <p>
          <span class="status">
            ${EVENT_KEY} ACTIVE
          </span>
        </p>

        <p>WhatsApp Invitation System</p>

        <p>
          <strong>Event:</strong> ${EVENT_KEY}
        </p>

        <p>
          <strong>Database:</strong> ${databaseStatus}
        </p>

        <p>
          <strong>WhatsApp:</strong>
          ${WHATSAPP_TOKEN ? "CONFIGURED" : "NOT CONFIGURED"}
        </p>
      </div>
    </body>
    </html>
  `);
});

// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    event: EVENT_KEY,
    supabase: !!supabase,
    whatsapp: !!WHATSAPP_TOKEN,
    time: new Date().toISOString()
  });
});

// =====================================================
// WHATSAPP WEBHOOK VERIFICATION
// =====================================================

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("🔐 WhatsApp webhook verification request");

  if (
    mode === "subscribe" &&
    token === VERIFY_TOKEN
  ) {
    console.log("✅ Webhook verification successful");

    return res.status(200).send(challenge);
  }

  console.log("❌ Webhook verification failed");

  return res.sendStatus(403);
});

// =====================================================
// EXTRACT MESSAGE
// =====================================================

function extractIncomingMessage(message) {
  if (!message) {
    return null;
  }

  // Normal text message
  if (message.type === "text") {
    return {
      text: message.text?.body || "",
      messageId: message.id || null
    };
  }

  // Interactive button reply
  if (message.type === "interactive") {
    if (message.interactive?.type === "button_reply") {
      return {
        text:
          message.interactive.button_reply?.title ||
          message.interactive.button_reply?.id ||
          "",
        messageId: message.id || null
      };
    }

    if (message.interactive?.type === "list_reply") {
      return {
        text:
          message.interactive.list_reply?.title ||
          message.interactive.list_reply?.id ||
          "",
        messageId: message.id || null
      };
    }
  }

  return null;
}

// =====================================================
// NORMALIZE PHONE NUMBER
// =====================================================

function normalizePhone(phone) {
  if (!phone) return "";

  let value = String(phone).trim();

  // Remove +
  value = value.replace(/\+/g, "");

  // Remove spaces, brackets, hyphens etc.
  value = value.replace(/[^\d]/g, "");

  // Tanzania local format: 07XXXXXXXX / 06XXXXXXXX
  if (value.startsWith("0") && value.length === 10) {
    value = "255" + value.substring(1);
  }

  return value;
}

// =====================================================
// CONVERT WHATSAPP RESPONSE TO DATABASE STATUS
// =====================================================

function getAttendanceStatus(text) {
  if (!text) return null;

  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  // NITASHIRIKI
  if (
    normalized === "nitashiriki" ||
    normalized.includes("nitashiriki")
  ) {
    return "confirmed";
  }

  // SITASHIRIKI
  if (
    normalized === "sitashiriki" ||
    normalized.includes("sitashiriki")
  ) {
    return "declined";
  }

  // SINA UHAKIKA
  if (
    normalized === "sina uhakika" ||
    normalized.includes("sina uhakika")
  ) {
    return "maybe";
  }

  return null;
}

// =====================================================
// FIND GUEST
// =====================================================

async function findGuest(phone) {
  if (!supabase) {
    throw new Error("Supabase haija-configurewa");
  }

  const normalizedPhone = normalizePhone(phone);

  console.log(
    `🔎 Kutafuta guest mwenye namba: ${normalizedPhone}`
  );

  // First try exact phone
  let result = await supabase
    .from("guests")
    .select("*")
    .eq("phone", normalizedPhone)
    .eq("event_key", EVENT_KEY)
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  if (result.data) {
    return result.data;
  }

  // Fallback: search by phone without event filter
  result = await supabase
    .from("guests")
    .select("*")
    .eq("phone", normalizedPhone)
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  return result.data || null;
}

// =====================================================
// SAVE ATTENDANCE
// =====================================================

async function saveAttendance(
  guest,
  status,
  whatsappMessageId
) {
  const updateData = {
    attendance_status: status
  };

  // Save WhatsApp message ID
  if (whatsappMessageId) {
    updateData.whatsapp_message_id =
      whatsappMessageId;
  }

  // Save scan/update timestamp
  updateData.scanned_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("guests")
    .update(updateData)
    .eq("id", guest.id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

// =====================================================
// WHATSAPP WEBHOOK RECEIVE
// =====================================================

app.post("/webhook", async (req, res) => {
  // Respond immediately to Meta
  res.sendStatus(200);

  try {
    console.log("");
    console.log("==============================================");
    console.log("📩 WhatsApp webhook received");
    console.log("==============================================");

    const body = req.body;

    if (!body) {
      console.log("⚠️ Empty webhook body");
      return;
    }

    // Ignore non-WhatsApp webhook events
    if (body.object !== "whatsapp_business_account") {
      console.log("ℹ️ Sio WhatsApp Business event");
      return;
    }

    const entries = body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];

      for (const change of changes) {
        const value = change.value;

        if (!value) {
          continue;
        }

        const messages = value.messages || [];

        if (messages.length === 0) {
          console.log(
            "ℹ️ Webhook imepokelewa lakini hakuna message mpya."
          );
          continue;
        }

        for (const message of messages) {
          const senderPhone = normalizePhone(
            message.from
          );

          const incoming =
            extractIncomingMessage(message);

          if (!incoming) {
            console.log(
              `ℹ️ Message type '${message.type}' haijashughulikiwa.`
            );
            continue;
          }

          const responseText =
            incoming.text.trim();

          console.log(
            `📱 Response: ${senderPhone} -> ${responseText}`
          );

          // =================================================
          // CONVERT RESPONSE
          // =================================================

          const attendanceStatus =
            getAttendanceStatus(responseText);

          if (!attendanceStatus) {
            console.log(
              "ℹ️ Ujumbe hauna response ya attendance."
            );
            continue;
          }

          console.log(
            `✅ Attendance response: ${attendanceStatus}`
          );

          // =================================================
          // FIND GUEST
          // =================================================

          const guest = await findGuest(
            senderPhone
          );

          if (!guest) {
            console.log(
              `⚠️ Hakuna guest mwenye namba ${senderPhone}`
            );
            continue;
          }

          console.log(
            `👤 Guest amepatikana: ${guest.full_name}`
          );

          // =================================================
          // CHECK EVENT
          // =================================================

          if (
            guest.event_key &&
            guest.event_key !== EVENT_KEY
          ) {
            console.log(
              `⚠️ Guest huyu ni wa ${guest.event_key},`
              + ` sio ${EVENT_KEY}`
            );

            continue;
          }

          // =================================================
          // SAVE
          // =================================================

          const updatedGuest =
            await saveAttendance(
              guest,
              attendanceStatus,
              incoming.messageId
            );

          console.log(
            `🎉 Attendance imehifadhiwa:`
            + ` ${updatedGuest.full_name}`
            + ` -> ${updatedGuest.attendance_status}`
          );

          console.log(
            "=============================================="
          );
        }
      }
    }
  } catch (error) {
    console.error("");
    console.error(
      "❌ Attendance update error:"
    );
    console.error(error);
    console.error("");
  }
});

// =====================================================
// 404
// =====================================================

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found"
  });
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
  console.log("==============================================");
  console.log("🚀 GeitaCard Server iko LIVE");
  console.log("==============================================");
  console.log(`📌 EVENT: ${EVENT_KEY}`);
  console.log(`🌐 PORT: ${PORT}`);
  console.log(
    `🗄️ Supabase: ${supabase ? "CONNECTED" : "NOT CONNECTED"}`
  );
  console.log(
    `📱 WhatsApp: ${WHATSAPP_TOKEN ? "CONFIGURED" : "NOT CONFIGURED"}`
  );
  console.log("==============================================");
});
