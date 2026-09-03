const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =====================================================
// ENVIRONMENT
// =====================================================

const PORT = process.env.PORT || 10000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const INVITE_IMAGE_URL =
  process.env.INVITE_IMAGE_URL;

const TEMPLATE_NAME =
  process.env.TEMPLATE_NAME || "kadi_ya_mwaliko";

const TEMPLATE_LANGUAGE =
  process.env.TEMPLATE_LANGUAGE || "sw";

const EVENT_KEY =
  process.env.DEFAULT_EVENT || "EVENT_A";

// Graph API version
const GRAPH_API_VERSION = "v23.0";

// =====================================================
// SUPABASE
// =====================================================

let supabase = null;

if (
  SUPABASE_URL &&
  SUPABASE_SERVICE_ROLE_KEY
) {
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
  `🗄️ SUPABASE_URL: ${
    SUPABASE_URL ? "SET" : "MISSING"
  }`
);

console.log(
  `🗄️ SUPABASE_SERVICE_ROLE_KEY: ${
    SUPABASE_SERVICE_ROLE_KEY
      ? "SET"
      : "MISSING"
  }`
);

console.log(
  `📱 WHATSAPP_TOKEN: ${
    WHATSAPP_TOKEN ? "SET" : "MISSING"
  }`
);

console.log(
  `📞 PHONE_NUMBER_ID: ${
    PHONE_NUMBER_ID ? "SET" : "MISSING"
  }`
);

console.log(
  `🖼️ INVITE_IMAGE_URL: ${
    INVITE_IMAGE_URL ? "SET" : "MISSING"
  }`
);

console.log(
  `📄 TEMPLATE_NAME: ${TEMPLATE_NAME}`
);

console.log(
  `🌍 TEMPLATE_LANGUAGE: ${TEMPLATE_LANGUAGE}`
);

console.log(
  `🔐 VERIFY_TOKEN: ${
    VERIFY_TOKEN ? "SET" : "MISSING"
  }`
);

console.log("==============================================");

// =====================================================
// HOME + TEST SEND FORM
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

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>GeitaCard</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 20px;
  font-family: Arial, sans-serif;
  background: #f4f6fb;
  color: #222;
}

.container {
  max-width: 650px;
  margin: auto;
}

.card {
  background: white;
  padding: 22px;
  border-radius: 16px;
  margin-bottom: 18px;
  box-shadow: 0 3px 15px rgba(0,0,0,.08);
}

h1 {
  margin-top: 0;
}

h2 {
  margin-top: 0;
  font-size: 21px;
}

.status {
  background: #e8f8ef;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 15px;
}

.ok {
  color: #198754;
  font-weight: bold;
}

.info {
  color: #555;
  font-size: 14px;
}

label {
  display: block;
  font-weight: bold;
  margin-top: 14px;
  margin-bottom: 6px;
}

input {
  width: 100%;
  padding: 14px;
  border: 1px solid #ddd;
  border-radius: 10px;
  font-size: 16px;
}

button {
  width: 100%;
  margin-top: 20px;
  padding: 15px;
  border: 0;
  border-radius: 10px;
  background: #198754;
  color: white;
  font-size: 17px;
  font-weight: bold;
  cursor: pointer;
}

button:disabled {
  opacity: .6;
}

.result {
  display: none;
  margin-top: 18px;
  padding: 14px;
  border-radius: 10px;
  white-space: pre-wrap;
  word-break: break-word;
}

.success {
  display: block;
  background: #e8f8ef;
  color: #146c43;
}

.error {
  display: block;
  background: #fdeaea;
  color: #a61b1b;
}

.small {
  font-size: 13px;
  color: #777;
  margin-top: 12px;
}

</style>

</head>

<body>

<div class="container">

  <!-- STATUS -->
  <div class="card">

    <h1>🎟️ GeitaCard</h1>

    <div class="status">

      <div class="ok">
        🟢 Server ACTIVE
      </div>

      <p>
        <strong>Event:</strong>
        ${EVENT_KEY}
      </p>

      <p>
        <strong>Database:</strong>
        ${databaseStatus}
      </p>

      <p>
        <strong>WhatsApp:</strong>
        ${
          WHATSAPP_TOKEN &&
          PHONE_NUMBER_ID
            ? "CONFIGURED"
            : "NOT CONFIGURED"
        }
      </p>

      <p>
        <strong>Template:</strong>
        ${TEMPLATE_NAME}
      </p>

      <p>
        <strong>Language:</strong>
        ${TEMPLATE_LANGUAGE}
      </p>

    </div>

  </div>


  <!-- TEST INVITATION -->
  <div class="card">

    <h2>📨 Tuma Test Invitation</h2>

    <p class="info">
      Tumia sehemu hii kutuma kadi kwa mtu mmoja
      kwanza kabla ya kuanza kutuma kwa waalikwa wengi.
    </p>

    <form id="testForm">

      <label>
        Namba ya WhatsApp
      </label>

      <input
        id="phone"
        name="phone"
        type="tel"
        placeholder="Mfano: 0740267204"
        required
      >

      <label>
        Jina la Mualikwa
      </label>

      <input
        id="full_name"
        name="full_name"
        type="text"
        placeholder="Mfano: Test Guest"
        required
      >

      <label>
        Code ya Mualikwa
      </label>

      <input
        id="guest_code"
        name="guest_code"
        type="text"
        placeholder="Mfano: 9750-KAMATI"
        required
      >

      <button
        id="sendButton"
        type="submit"
      >
        📤 TUMA TEST INVITATION
      </button>

    </form>

    <div
      id="result"
      class="result"
    ></div>

    <div class="small">
      ⚠️ Kwa sasa tumia mtu mmoja tu wa majaribio.
      Usitumie bulk sending bado.
    </div>

  </div>

</div>


<script>

const form =
  document.getElementById("testForm");

const button =
  document.getElementById("sendButton");

const result =
  document.getElementById("result");


form.addEventListener(
  "submit",
  async function(event) {

    event.preventDefault();

    result.className = "result";
    result.style.display = "block";
    result.textContent =
      "⏳ Inatuma invitation...";

    button.disabled = true;
    button.textContent =
      "⏳ Inatuma...";

    const phone =
      document
        .getElementById("phone")
        .value
        .trim();

    const full_name =
      document
        .getElementById("full_name")
        .value
        .trim();

    const guest_code =
      document
        .getElementById("guest_code")
        .value
        .trim();


    try {

      const response =
        await fetch(
          "/send-invite",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({
                phone,
                full_name,
                guest_code
              })
          }
        );


      const data =
        await response.json();


      if (!response.ok || !data.ok) {

        throw new Error(
          data.error ||
          "Invitation sending failed"
        );

      }


      result.className =
        "result success";

      result.textContent =
        "✅ INVITATION IMETUMWA!\\n\\n" +
        "Namba: " +
        data.phone +
        "\\n" +
        "Jina: " +
        data.full_name +
        "\\n" +
        "Code: " +
        data.guest_code +
        "\\n\\n" +
        "📱 Angalia WhatsApp sasa.";

    }

    catch (error) {

      result.className =
        "result error";

      result.textContent =
        "❌ KUTUMA KUMESHINDIKANA\\n\\n" +
        error.message;

    }

    finally {

      button.disabled = false;

      button.textContent =
        "📤 TUMA TEST INVITATION";

    }

  }
);

</script>

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

    phone_number_id:
      !!PHONE_NUMBER_ID,

    invite_image:
      !!INVITE_IMAGE_URL,

    template:
      TEMPLATE_NAME,

    language:
      TEMPLATE_LANGUAGE,

    time:
      new Date().toISOString()

  });

});

// =====================================================
// NORMALIZE PHONE
// =====================================================

function normalizePhone(phone) {

  if (!phone) return "";

  let value =
    String(phone).trim();

  value =
    value.replace(/[^\d]/g, "");

  // Tanzania:
  // 07XXXXXXXX
  // 06XXXXXXXX

  if (
    value.startsWith("0") &&
    value.length === 10
  ) {

    value =
      "255" +
      value.substring(1);

  }

  return value;

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


  let result =
    await supabase
      .from("guests")
      .select("*")
      .eq(
        "phone",
        normalizedPhone
      )
      .eq(
        "event_key",
        EVENT_KEY
      )
      .limit(1)
      .maybeSingle();


  if (result.error) {

    throw result.error;

  }


  if (result.data) {

    return result.data;

  }


  // Fallback
  result =
    await supabase
      .from("guests")
      .select("*")
      .eq(
        "phone",
        normalizedPhone
      )
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

    attendance_status:
      status,

    scanned_at:
      new Date().toISOString()

  };


  if (whatsappMessageId) {

    updateData.whatsapp_message_id =
      whatsappMessageId;

  }


  const {
    data,
    error
  } =
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
// ATTENDANCE STATUS
// =====================================================

function getAttendanceStatus(text) {

  if (!text) return null;

  const normalized =
    text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");


  if (
    normalized === "nitashiriki" ||
    normalized.includes(
      "nitashiriki"
    )
  ) {

    return "confirmed";

  }


  if (
    normalized === "sitashiriki" ||
    normalized.includes(
      "sitashiriki"
    )
  ) {

    return "declined";

  }


  if (
    normalized === "sina uhakika" ||
    normalized.includes(
      "sina uhakika"
    )
  ) {

    return "maybe";

  }


  return null;

}

// =====================================================
// RESPONSE MESSAGE
// =====================================================

function getResponseMessage(
  status
) {

  if (
    status === "confirmed"
  ) {

    return (
      "Asante kwa jibu lako. " +
      "Karibu sana GeitaCard! " +
      "Tunafurahi kuthibitisha kuwa utashiriki."
    );

  }


  if (
    status === "declined"
  ) {

    return (
      "Asante kwa taarifa yako. " +
      "Tumejua kuwa hutashiriki. " +
      "Karibu tena wakati mwingine. GeitaCard."
    );

  }


  if (
    status === "maybe"
  ) {

    return (
      "Asante kwa taarifa yako. " +
      "Tafadhali tupatie jibu lako " +
      "litakapokuwa tayari. " +
      "Karibu sana GeitaCard."
    );

  }


  return null;

}

// =====================================================
// EXTRACT WHATSAPP MESSAGE
// =====================================================

function extractIncomingMessage(
  message
) {

  if (!message) {

    return null;

  }


  // TEXT
  if (
    message.type === "text"
  ) {

    return {

      text:
        message.text?.body ||
        "",

      messageId:
        message.id ||
        null

    };

  }


  // INTERACTIVE
  if (
    message.type ===
    "interactive"
  ) {

    if (
      message.interactive?.type ===
      "button_reply"
    ) {

      return {

        text:
          message
            .interactive
            .button_reply?.title ||
          message
            .interactive
            .button_reply?.id ||
          "",

        buttonId:
          message
            .interactive
            .button_reply?.id ||
          null,

        messageId:
          message.id ||
          null

      };

    }


    if (
      message.interactive?.type ===
      "list_reply"
    ) {

      return {

        text:
          message
            .interactive
            .list_reply?.title ||
          message
            .interactive
            .list_reply?.id ||
          "",

        buttonId:
          message
            .interactive
            .list_reply?.id ||
          null,

        messageId:
          message.id ||
          null

      };

    }

  }


  // TEMPLATE QUICK REPLY
  if (
    message.type === "button"
  ) {

    return {

      text:
        message.button?.text ||
        message.button?.payload ||
        "",

      buttonId:
        message.button?.payload ||
        null,

      messageId:
        message.id ||
        null

    };

  }


  return null;

}

// =====================================================
// SEND TEXT MESSAGE
// =====================================================

async function sendWhatsAppText(
  recipient,
  text
) {

  if (!WHATSAPP_TOKEN) {

    throw new Error(
      "WHATSAPP_TOKEN haipo"
    );

  }


  if (!PHONE_NUMBER_ID) {

    throw new Error(
      "PHONE_NUMBER_ID haipo"
    );

  }


  const url =
    `https://graph.facebook.com/` +
    `${GRAPH_API_VERSION}/` +
    `${PHONE_NUMBER_ID}/messages`;


  const response =
    await fetch(
      url,
      {

        method: "POST",

        headers: {

          "Authorization":
            `Bearer ${WHATSAPP_TOKEN}`,

          "Content-Type":
            "application/json"

        },

        body:
          JSON.stringify({

            messaging_product:
              "whatsapp",

            to:
              recipient,

            type:
              "text",

            text: {

              body:
                text

            }

          })

      }
    );


  const data =
    await response.json();


  if (!response.ok) {

    console.error(
      "❌ WhatsApp text send error:",
      data
    );

    throw new Error(
      data?.error?.message ||
      "WhatsApp text message failed"
    );

  }


  console.log(
    "📤 Reply sent successfully:",
    data
  );


  return data;

}

// =====================================================
// SEND INVITATION TEMPLATE
// =====================================================

async function sendInvitation(
  recipient,
  guestName,
  guestCode
) {

  if (!WHATSAPP_TOKEN) {

    throw new Error(
      "WHATSAPP_TOKEN haipo"
    );

  }


  if (!PHONE_NUMBER_ID) {

    throw new Error(
      "PHONE_NUMBER_ID haipo"
    );

  }


  if (!INVITE_IMAGE_URL) {

    throw new Error(
      "INVITE_IMAGE_URL haipo"
    );

  }


  const url =
    `https://graph.facebook.com/` +
    `${GRAPH_API_VERSION}/` +
    `${PHONE_NUMBER_ID}/messages`;


  /*
   * Template:
   *
   * {{1}} = jina
   * {{2}} = code
   */


  const payload = {

    messaging_product:
      "whatsapp",

    to:
      recipient,

    type:
      "template",

    template: {

      name:
        TEMPLATE_NAME,

      language: {

        code:
          TEMPLATE_LANGUAGE

      },

      components: [

        // IMAGE HEADER
        {
          type:
            "header",

          parameters: [

            {

              type:
                "image",

              image: {

                link:
                  INVITE_IMAGE_URL

              }

            }

          ]

        },


        // BODY VARIABLES
        {
          type:
            "body",

          parameters: [

            {

              type:
                "text",

              text:
                String(
                  guestName
                )

            },

            {

              type:
                "text",

              text:
                String(
                  guestCode
                )

            }

          ]

        }

      ]

    }

  };


  console.log(
    "📤 Sending invitation:",
    JSON.stringify(
      payload,
      null,
      2
    )
  );


  const response =
    await fetch(
      url,
      {

        method:
          "POST",

        headers: {

          "Authorization":
            `Bearer ${WHATSAPP_TOKEN}`,

          "Content-Type":
            "application/json"

        },

        body:
          JSON.stringify(
            payload
          )

      }
    );


  const data =
    await response.json();


  if (!response.ok) {

    console.error(
      "❌ WhatsApp invitation error:",
      JSON.stringify(
        data,
        null,
        2
      )
    );

    throw new Error(
      data?.error?.message ||
      "Invitation sending failed"
    );

  }


  console.log(
    "✅ Invitation sent:",
    data
  );


  return data;

}

// =====================================================
// SEND INVITATION ENDPOINT
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

        return res
          .status(400)
          .json({

            ok: false,

            error:
              "phone inahitajika"

          });

      }


      if (!full_name) {

        return res
          .status(400)
          .json({

            ok: false,

            error:
              "full_name inahitajika"

          });

      }


      if (!guest_code) {

        return res
          .status(400)
          .json({

            ok: false,

            error:
              "guest_code inahitajika"

          });

      }


      const recipient =
        normalizePhone(
          phone
        );


      if (!recipient) {

        return res
          .status(400)
          .json({

            ok: false,

            error:
              "Namba ya WhatsApp sio sahihi"

          });

      }


      const result =
        await sendInvitation(
          recipient,
          full_name,
          guest_code
        );


      res.json({

        ok: true,

        message:
          "Invitation imetumwa",

        phone:
          recipient,

        full_name,

        guest_code,

        whatsapp:
          result

      });

    }

    catch (error) {

      console.error(
        "❌ /send-invite error:",
        error
      );


      res
        .status(500)
        .json({

          ok: false,

          error:
            error.message

        });

    }

  }
);

// =====================================================
// WHATSAPP WEBHOOK VERIFY
// =====================================================

app.get(
  "/webhook",
  (req, res) => {

    const mode =
      req.query["hub.mode"];

    const token =
      req.query[
        "hub.verify_token"
      ];

    const challenge =
      req.query[
        "hub.challenge"
      ];


    console.log(
      "🔐 WhatsApp webhook verification request"
    );


    if (
      mode === "subscribe" &&
      token === VERIFY_TOKEN
    ) {

      console.log(
        "✅ Webhook verification successful"
      );


      return res
        .status(200)
        .send(challenge);

    }


    console.log(
      "❌ Webhook verification failed"
    );


    return res
      .sendStatus(403);

  }
);

// =====================================================
// WHATSAPP WEBHOOK RECEIVE
// =====================================================

app.post(
  "/webhook",
  async (req, res) => {

    // Meta lazima ipate 200 haraka
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


      const body =
        req.body;


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


      for (
        const entry of entries
      ) {

        const changes =
          entry.changes || [];


        for (
          const change of changes
        ) {

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
              "ℹ️ Hakuna message mpya"
            );

            continue;

          }


          for (
            const message
            of messages
          ) {

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
                `ℹ️ Message type '${message.type}' haijashughulikiwa`
              );

              continue;

            }


            const responseText =
              incoming.text.trim();


            console.log(
              `📱 Response: ${senderPhone} -> ${responseText}`
            );


            // =================================================
            // DETERMINE ATTENDANCE
            // =================================================

            const attendanceStatus =
              getAttendanceStatus(
                responseText
              );


            if (!attendanceStatus) {

              console.log(
                "ℹ️ Sio attendance response"
              );

              continue;

            }


            console.log(
              `✅ Attendance: ${attendanceStatus}`
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
              `👤 Guest: ${guest.full_name}`
            );


            // =================================================
            // EVENT CHECK
            // =================================================

            if (
              guest.event_key &&
              guest.event_key !==
                EVENT_KEY
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

            const reply =
              getResponseMessage(
                attendanceStatus
              );


            if (reply) {

              try {

                await sendWhatsAppText(
                  senderPhone,
                  reply
                );

              }

              catch (sendError) {

                console.error(
                  "❌ Reply imeshindikana:",
                  sendError
                );

              }

            }


            console.log(
              "=============================================="
            );

          }

        }

      }

    }

    catch (error) {

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

    res
      .status(404)
      .json({

        error:
          "Route not found"

      });

  }
);

// =====================================================
// START
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
        PHONE_NUMBER_ID
          ? "CONFIGURED"
          : "NOT CONFIGURED"
      }`
    );


    console.log(
      `🖼️ Invite Image: ${
        INVITE_IMAGE_URL
          ? "CONFIGURED"
          : "NOT CONFIGURED"
      }`
    );


    console.log(
      `📄 Template: ${TEMPLATE_NAME}`
    );


    console.log(
      `🌍 Language: ${TEMPLATE_LANGUAGE}`
    );


    console.log(
      "=============================================="
    );

  }
);
