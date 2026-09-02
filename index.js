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

const WHATSAPP_PHONE_NUMBER_ID =
  process.env.WHATSAPP_PHONE_NUMBER_ID;

const INVITE_IMAGE_URL =
  process.env.INVITE_IMAGE_URL;

const GRAPH_API_VERSION =
  process.env.GRAPH_API_VERSION || "v23.0";

const EVENT_KEY = "EVENT_A";

// Template yako ya Meta
const TEMPLATE_NAME = "kadi_ya_mwaliko";
const TEMPLATE_LANGUAGE = "sw";

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
// STARTUP
// =====================================================

console.log("==============================================");
console.log("🎟️ GeitaCard Server inaanza...");
console.log("==============================================");

console.log(`📌 EVENT: ${EVENT_KEY}`);
console.log(`🌐 PORT: ${PORT}`);

console.log(
  `🟢 SUPABASE_URL: ${
    SUPABASE_URL ? "SET" : "MISSING"
  }`
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
  `🟢 WHATSAPP_PHONE_NUMBER_ID: ${
    WHATSAPP_PHONE_NUMBER_ID ? "SET" : "MISSING"
  }`
);

console.log(
  `🟢 VERIFY_TOKEN: ${
    VERIFY_TOKEN ? "SET" : "MISSING"
  }`
);

console.log(
  `🟢 INVITE_IMAGE_URL: ${
    INVITE_IMAGE_URL ? "SET" : "MISSING"
  }`
);

console.log(`🟢 TEMPLATE: ${TEMPLATE_NAME}`);
console.log(`🟢 LANGUAGE: ${TEMPLATE_LANGUAGE}`);

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
<strong>Database:</strong>
${databaseStatus}
</p>

<p>
<strong>WhatsApp:</strong>
${WHATSAPP_TOKEN ? "CONFIGURED" : "NOT CONFIGURED"}
</p>

<p>
<strong>Phone ID:</strong>
${WHATSAPP_PHONE_NUMBER_ID ? "CONFIGURED" : "MISSING"}
</p>

<p>
<strong>Template:</strong>
${TEMPLATE_NAME}
</p>

</div>

</body>
</html>
`);
});

// =====================================================
// HEALTH
// =====================================================

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    event: EVENT_KEY,
    supabase: !!supabase,
    whatsapp: !!WHATSAPP_TOKEN,
    phone_number_id: !!WHATSAPP_PHONE_NUMBER_ID,
    invite_image: !!INVITE_IMAGE_URL,
    template: TEMPLATE_NAME,
    language: TEMPLATE_LANGUAGE,
    time: new Date().toISOString()
  });
});

// =====================================================
// WHATSAPP WEBHOOK VERIFY
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
    console.log(
      "✅ Webhook verification successful"
    );

    return res.status(200).send(challenge);
  }

  console.log(
    "❌ Webhook verification failed"
  );

  return res.sendStatus(403);
});

// =====================================================
// NORMALIZE PHONE
// =====================================================

function normalizePhone(phone) {
  if (!phone) return "";

  let value = String(phone).trim();

  value = value.replace(/\+/g, "");
  value = value.replace(/[^\d]/g, "");

  // Tanzania local number
  if (
    value.startsWith("0") &&
    value.length === 10
  ) {
    value = "255" + value.substring(1);
  }

  return value;
}

// =====================================================
// EXTRACT INCOMING MESSAGE
// =====================================================

function extractIncomingMessage(message) {
  if (!message) {
    return null;
  }

  // Text
  if (message.type === "text") {
    return {
      text: message.text?.body || "",
      messageId: message.id || null,
      buttonId: null
    };
  }

  // Interactive
  if (message.type === "interactive") {

    // Quick reply button
    if (
      message.interactive?.type ===
      "button_reply"
    ) {
      return {
        text:
          message.interactive.button_reply?.title ||
          "",
        buttonId:
          message.interactive.button_reply?.id ||
          null,
        messageId: message.id || null
      };
    }

    // List reply
    if (
      message.interactive?.type ===
      "list_reply"
    ) {
      return {
        text:
          message.interactive.list_reply?.title ||
          "",
        buttonId:
          message.interactive.list_reply?.id ||
          null,
        messageId: message.id || null
      };
    }
  }

  return null;
}

// =====================================================
// ATTENDANCE STATUS
// =====================================================

function getAttendanceStatus(text, buttonId = null) {

  const combined =
    `${buttonId || ""} ${text || ""}`
      .trim()
      .toLowerCase();

  // ===================================================
  // CONFIRMED
  // ===================================================

  if (
    combined.includes("nitashiriki") ||
    combined.includes("confirmed")
  ) {
    return "confirmed";
  }

  // ===================================================
  // DECLINED
  // ===================================================

  if (
    combined.includes("sitashiriki") ||
    combined.includes("declined")
  ) {
    return "declined";
  }

  // ===================================================
  // MAYBE
  // ===================================================

  if (
    combined.includes("sina uhakika") ||
    combined.includes("maybe")
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
    throw new Error(
      "Supabase haija-configurewa"
    );
  }

  const normalizedPhone =
    normalizePhone(phone);

  console.log(
    `🔎 Kutafuta guest: ${normalizedPhone}`
  );

  // Exact event + phone
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

  // Fallback phone only
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
    attendance_status: status,
    scanned_at: new Date().toISOString()
  };

  if (whatsappMessageId) {
    updateData.whatsapp_message_id =
      whatsappMessageId;
  }

  const { data, error } =
    await supabase
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
// SEND WHATSAPP TEXT
// =====================================================

async function sendWhatsAppText(
  recipient,
  text
) {

  if (
    !WHATSAPP_TOKEN ||
    !WHATSAPP_PHONE_NUMBER_ID
  ) {
    throw new Error(
      "WHATSAPP_TOKEN au WHATSAPP_PHONE_NUMBER_ID haipo"
    );
  }

  const url =
    `https://graph.facebook.com/` +
    `${GRAPH_API_VERSION}/` +
    `${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: "POST",

    headers: {
      "Authorization":
        `Bearer ${WHATSAPP_TOKEN}`,

      "Content-Type":
        "application/json"
    },

    body: JSON.stringify({
      messaging_product: "whatsapp",

      to: normalizePhone(recipient),

      type: "text",

      text: {
        preview_url: false,
        body: text
      }
    })
  });

  const result =
    await response.json();

  if (!response.ok) {
    console.error(
      "❌ WhatsApp text error:",
      result
    );

    throw new Error(
      JSON.stringify(result)
    );
  }

  console.log(
    "✅ WhatsApp reply imetumwa"
  );

  return result;
}

// =====================================================
// SEND INVITATION TEMPLATE
// =====================================================

async function sendInvitation(
  recipient,
  fullName,
  guestCode
) {

  if (
    !WHATSAPP_TOKEN ||
    !WHATSAPP_PHONE_NUMBER_ID
  ) {
    throw new Error(
      "WhatsApp credentials hazijakamilika"
    );
  }

  if (!INVITE_IMAGE_URL) {
    throw new Error(
      "INVITE_IMAGE_URL haijawekwa"
    );
  }

  const phone =
    normalizePhone(recipient);

  const url =
    `https://graph.facebook.com/` +
    `${GRAPH_API_VERSION}/` +
    `${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  // ===================================================
  // TEMPLATE
  //
  // {{1}} = jina
  // {{2}} = code
  // ===================================================

  const payload = {

    messaging_product: "whatsapp",

    to: phone,

    type: "template",

    template: {

      name: TEMPLATE_NAME,

      language: {
        code: TEMPLATE_LANGUAGE
      },

      components: [

        // IMAGE HEADER
        {
          type: "header",

          parameters: [
            {
              type: "image",

              image: {
                link: INVITE_IMAGE_URL
              }
            }
          ]
        },

        // BODY
        {
          type: "body",

          parameters: [
            {
              type: "text",
              text: String(fullName)
            },

            {
              type: "text",
              text: String(guestCode)
            }
          ]
        }

        // Buttons hazihitaji parameters
      ]
    }
  };

  console.log(
    `📨 Inatuma kadi kwa ${phone}`
  );

  console.log(
    `👤 Jina: ${fullName}`
  );

  console.log(
    `🎟️ Code: ${guestCode}`
  );

  const response =
    await fetch(url, {

      method: "POST",

      headers: {

        "Authorization":
          `Bearer ${WHATSAPP_TOKEN}`,

        "Content-Type":
          "application/json"
      },

      body: JSON.stringify(payload)
    });

  const result =
    await response.json();

  if (!response.ok) {

    console.error(
      "❌ WhatsApp template error:",
      result
    );

    throw new Error(
      JSON.stringify(result)
    );
  }

  console.log(
    "✅ Kadi imetumwa kikamilifu"
  );

  return result;
}

// =====================================================
// SEND ATTENDANCE RESPONSE
// =====================================================

async function sendAttendanceResponse(
  phone,
  status
) {

  let message = "";

  // ===================================================
  // CONFIRMED
  // ===================================================

  if (status === "confirmed") {

    message =
      "Asante kwa jibu lako. " +
      "Karibu sana GeitaCard! " +
      "Tunafurahi kuthibitisha kuwa utashiriki.";

  }

  // ===================================================
  // DECLINED
  // ===================================================

  else if (status === "declined") {

    message =
      "Asante kwa taarifa yako. " +
      "Tumejua kuwa hutashiriki. " +
      "Karibu tena wakati mwingine. " +
      "GeitaCard.";

  }

  // ===================================================
  // MAYBE
  // ===================================================

  else if (status === "maybe") {

    message =
      "Asante kwa taarifa yako. " +
      "Tafadhali tupatie jibu lako " +
      "litakapokuwa tayari. " +
      "Karibu sana GeitaCard.";

  }

  if (message) {

    await sendWhatsAppText(
      phone,
      message
    );
  }
}

// =====================================================
// SEND INVITATION API
// =====================================================
//
// POST /send-invite
//
// JSON:
// {
//   "phone": "2557XXXXXXXX",
//   "full_name": "Rajabu",
//   "guest_code": "9751-SINGLE"
// }
//
// =====================================================

app.post(
  "/send-invite",
  async (req, res) => {

    try {

      const {
        phone,
        full_name,
        guest_code
      } = req.body;

      if (!phone) {
        return res.status(400).json({
          ok: false,
          error: "phone inahitajika"
        });
      }

      if (!full_name) {
        return res.status(400).json({
          ok: false,
          error: "full_name inahitajika"
        });
      }

      if (!guest_code) {
        return res.status(400).json({
          ok: false,
          error: "guest_code inahitajika"
        });
      }

      const result =
        await sendInvitation(
          phone,
          full_name,
          guest_code
        );

      return res.json({
        ok: true,
        message:
          "Invitation imetumwa",
        whatsapp: result
      });

    } catch (error) {

      console.error(
        "❌ Send invite error:",
        error
      );

      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

// =====================================================
// WHATSAPP WEBHOOK RECEIVE
// =====================================================

app.post(
  "/webhook",
  async (req, res) => {

    // Meta ipate 200 haraka
    res.sendStatus(200);

    try {

      console.log("");
      console.log(
        "=============================================="
      );

      console.log(
        "📩 WhatsApp webhook received"
      );

      console.log(
        "=============================================="
      );

      const body = req.body;

      if (!body) {
        console.log(
          "⚠️ Empty webhook body"
        );
        return;
      }

      if (
        body.object !==
        "whatsapp_business_account"
      ) {

        console.log(
          "ℹ️ Sio WhatsApp Business event"
        );

        return;
      }

      const entries =
        body.entry || [];

      for (const entry of entries) {

        const changes =
          entry.changes || [];

        for (const change of changes) {

          const value =
            change.value;

          if (!value) {
            continue;
          }

          const messages =
            value.messages || [];

          if (
            messages.length === 0
          ) {

            console.log(
              "ℹ️ Hakuna message mpya."
            );

            continue;
          }

          for (const message of messages) {

            const senderPhone =
              normalizePhone(
                message.from
              );

            const incoming =
              extractIncomingMessage(
                message
              );

            if (!incoming) {

              console.log(
                `ℹ️ Message type '${message.type}' haijashughulikiwa.`
              );

              continue;
            }

            const responseText =
              incoming.text.trim();

            const buttonId =
              incoming.buttonId;

            console.log(
              `📱 Response: ${senderPhone} -> ${responseText}`
            );

            if (buttonId) {

              console.log(
                `🔘 Button ID: ${buttonId}`
              );
            }

            // =================================================
            // GET STATUS
            // =================================================

            const attendanceStatus =
              getAttendanceStatus(
                responseText,
                buttonId
              );

            if (!attendanceStatus) {

              console.log(
                "ℹ️ Ujumbe sio attendance response."
              );

              continue;
            }

            console.log(
              `✅ Attendance response: ${attendanceStatus}`
            );

            // =================================================
            // FIND GUEST
            // =================================================

            const guest =
              await findGuest(
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
            // EVENT CHECK
            // =================================================

            if (
              guest.event_key &&
              guest.event_key !== EVENT_KEY
            ) {

              console.log(
                `⚠️ Guest ni wa ${guest.event_key}, sio ${EVENT_KEY}`
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
              `🎉 Attendance imehifadhiwa: ` +
              `${updatedGuest.full_name} -> ` +
              `${updatedGuest.attendance_status}`
            );

            // =================================================
            // SEND AUTOMATIC RESPONSE
            // =================================================

            try {

              await sendAttendanceResponse(
                senderPhone,
                attendanceStatus
              );

            } catch (replyError) {

              console.error(
                "❌ Imeshindwa kutuma response kwa guest:",
                replyError
              );
            }

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
  }
);

// =====================================================
// 404
// =====================================================

app.use(
  (req, res) => {

    res.status(404).json({
      error: "Route not found"
    });

  }
);

// =====================================================
// START SERVER
// =====================================================

app.listen(
  PORT,
  () => {

    console.log(
      "=============================================="
    );

    console.log(
      "🚀 GeitaCard Server iko LIVE"
    );

    console.log(
      "=============================================="
    );

    console.log(
      `📌 EVENT: ${EVENT_KEY}`
    );

    console.log(
      `🌐 PORT: ${PORT}`
    );

    console.log(
      `🗄️ Supabase: ${
        supabase
          ? "CONNECTED"
          : "NOT CONNECTED"
      }`
    );

    console.log(
      `📱 WhatsApp: ${
        WHATSAPP_TOKEN
          ? "CONFIGURED"
          : "NOT CONFIGURED"
      }`
    );

    console.log(
      `📞 Phone Number ID: ${
        WHATSAPP_PHONE_NUMBER_ID
          ? "CONFIGURED"
          : "MISSING"
      }`
    );

    console.log(
      `🖼️ Invite Image: ${
        INVITE_IMAGE_URL
          ? "CONFIGURED"
          : "MISSING"
      }`
    );

    console.log(
      `📋 Template: ${TEMPLATE_NAME}`
    );

    console.log(
      "=============================================="
    );
  }
);
