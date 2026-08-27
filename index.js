const express = require("express");
const axios = require("axios");
const XLSX = require("xlsx");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(express.json());
app.use(express.static("public"));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

/* =========================================================
   ENVIRONMENT VARIABLES
========================================================= */

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const INVITE_IMAGE_URL = process.env.INVITE_IMAGE_URL;

const TEMPLATE_NAME =
  process.env.TEMPLATE_NAME || "geitacard_invitation";

const TEMPLATE_LANGUAGE =
  process.env.TEMPLATE_LANGUAGE || "sw";

const GRAPH_VERSION =
  process.env.GRAPH_VERSION || "v26.0";

const PORT = process.env.PORT || 10000;

/* =========================================================
   SUPABASE - SAVE GUEST
========================================================= */

async function saveGuest(to, name, code) {
  const phone = String(to).replace(/\D/g, "");

  const qrToken = crypto.randomUUID();

  const invitationType =
    process.env.INVITATION_TYPE || "premium";

  const { data, error } = await supabase
    .from("guests")
    .insert([
      {
        full_name: name,
        phone: phone,
        guest_code: code,
        qr_token: qrToken,
        invitation_type: invitationType,
        attendance_status: "pending"
      }
    ])
    .select()
    .single();

  if (error) {
    console.error(
      "Supabase save guest error:",
      error.message
    );

    throw error;
  }

  console.log("Guest saved to Supabase:", data);

  return data;
}

/* =========================================================
   BASIC CHECK
========================================================= */

console.log("==============================================");
console.log("GeitaCard WhatsApp Webhook starting...");
console.log("Template:", TEMPLATE_NAME);
console.log("Language:", TEMPLATE_LANGUAGE);
console.log("Graph Version:", GRAPH_VERSION);
console.log("==============================================");

/* =========================================================
   HOME
========================================================= */

app.get("/", (req, res) => {
  res.send("WhatsApp Webhook ya GeitaCard iko running!");
});

/* =========================================================
   WHATSAPP WEBHOOK VERIFICATION
========================================================= */

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("Webhook verification request received");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully");
    return res.status(200).send(challenge);
  }

  console.log("Webhook verification failed");
  return res.sendStatus(403);
});

/* =========================================================
   SEND TEXT MESSAGE
========================================================= */

async function sendText(to, text) {
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;

  try {
    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: {
          preview_url: false,
          body: text
        }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("Text reply sent:", response.data);

    return response.data;
  } catch (error) {
    console.error(
      "Text send error:",
      error.response?.data || error.message
    );

    throw error;
  }
}

/* =========================================================
   SEND INVITATION TEMPLATE
========================================================= */

async function sendInvitation(to, name, code) {
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const components = [];

  /* -------------------------------------------------------
     HEADER IMAGE
  ------------------------------------------------------- */

  if (INVITE_IMAGE_URL) {
    components.push({
      type: "header",
      parameters: [
        {
          type: "image",
          image: {
            link: INVITE_IMAGE_URL
          }
        }
      ]
    });
  }

  /* -------------------------------------------------------
     BODY VARIABLES

     Template:
     {{1}} = jina
     {{2}} = code
  ------------------------------------------------------- */

  components.push({
    type: "body",
    parameters: [
      {
        type: "text",
        text: name
      },
      {
        type: "text",
        text: code
      }
    ]
  });

  /* -------------------------------------------------------
     SEND TEMPLATE
  ------------------------------------------------------- */

  try {
    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "template",
        template: {
          name: TEMPLATE_NAME,
          language: {
            code: TEMPLATE_LANGUAGE
          },
          components: components
        }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("Invitation sent:", response.data);

    return response.data;
  } catch (error) {
    console.error(
      "Invitation send error:",
      JSON.stringify(
        error.response?.data || error.message,
        null,
        2
      )
    );

    throw error;
  }
}

/* =========================================================
   SUPABASE - UPDATE ATTENDANCE
========================================================= */

async function updateAttendance(phone, status) {
  const normalizedPhone = String(phone).replace(/\D/g, "");

  // Tafuta mwalikwa wa mwisho mwenye namba hii
  const { data: guest, error: findError } = await supabase
    .from("guests")
    .select("id, full_name, phone, guest_code")
    .eq("phone", normalizedPhone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    console.error(
      "Find guest error:",
      findError.message
    );
    return null;
  }

  if (!guest) {
    console.log(
      "Guest not found for phone:",
      normalizedPhone
    );
    return null;
  }

  const { data, error } = await supabase
    .from("guests")
    .update({
      attendance_status: status
    })
    .eq("id", guest.id)
    .select()
    .single();

  if (error) {
    console.error(
      "Attendance update error:",
      error.message
    );
    return null;
  }

  console.log(
    "Attendance updated:",
    guest.full_name,
    status
  );

  return data;
}

/* =========================================================
   WHATSAPP WEBHOOK - RECEIVE MESSAGES
========================================================= */

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    console.log("==============================================");
    console.log("Incoming WhatsApp message:");
    console.log(JSON.stringify(body, null, 2));
    console.log("==============================================");

    /* -----------------------------------------------------
       BASIC WHATSAPP CHECK
    ----------------------------------------------------- */

    if (
      body.object !== "whatsapp_business_account" ||
      !body.entry ||
      !body.entry[0]
    ) {
      return res.sendStatus(200);
    }

    const changes = body.entry[0].changes;

    if (!changes || !changes[0]) {
      return res.sendStatus(200);
    }

    const value = changes[0].value;

    /* =====================================================
       WHATSAPP MESSAGE STATUS
    ===================================================== */

    if (value.statuses && value.statuses.length > 0) {
      const status = value.statuses[0];

      console.log("========== WHATSAPP STATUS ==========");
      console.log("Message ID:", status.id);
      console.log("Status:", status.status);
      console.log("Recipient:", status.recipient_id);

      if (status.errors) {
        console.log(
          "STATUS ERROR:",
          JSON.stringify(status.errors, null, 2)
        );
      }

      console.log("======================================");

      return res.sendStatus(200);
    }

    /* =====================================================
       CHECK INCOMING MESSAGE
    ===================================================== */

    if (!value.messages || !value.messages[0]) {
      return res.sendStatus(200);
    }

    const message = value.messages[0];
    const from = message.from;

    console.log("Message type:", message.type);
    console.log("From:", from);

    /* =====================================================
       NORMAL TEXT MESSAGE
    ===================================================== */

    if (message.type === "text") {
      const text = message.text?.body || "";

      console.log("Text received:", text);

      return res.sendStatus(200);
    }

    /* =====================================================
       BUTTON REPLY
    ===================================================== */

    if (message.type === "button") {
      const buttonId =
        message.button?.payload || "";

      const buttonTitle =
        message.button?.text || "";

      console.log("==============================================");
      console.log("BUTTON REPLY");
      console.log("BUTTON ID:", buttonId);
      console.log("BUTTON TITLE:", buttonTitle);
      console.log("FROM:", from);
      console.log("==============================================");

      const normalizedId =
        buttonId.toLowerCase().trim();

      const normalizedTitle =
        buttonTitle.toLowerCase().trim();

      /* ---------------------------------------------------
         NITASHIRIKI
      --------------------------------------------------- */

      if (
        normalizedId === "nitashiriki" ||
        normalizedTitle === "nitashiriki"
      ) {
        await updateAttendance(
          from,
          "confirmed"
        );

        await sendText(
          from,
          "Asante kwa jibu lako. Karibu sana GeitaCard! Tunafurahi kuthibitisha kuwa utashiriki."
        );

        console.log("Nitashiriki response sent");

        return res.sendStatus(200);
      }

      /* ---------------------------------------------------
         SITASHIRIKI
      --------------------------------------------------- */

      if (
        normalizedId === "sitashiriki" ||
        normalizedTitle === "sitashiriki"
      ) {
        await updateAttendance(
          from,
          "declined"
        );

        await sendText(
          from,
          "Asante kwa taarifa yako. Tumejua kuwa hutashiriki. Karibu tena wakati mwingine. GeitaCard."
        );

        console.log("Sitashiriki response sent");

        return res.sendStatus(200);
      }

      /* ---------------------------------------------------
         SINA UHAKIKA
      --------------------------------------------------- */

      if (
        normalizedId === "sina_uhakika" ||
        normalizedId === "sinauhakika" ||
        normalizedTitle === "sina uhakika"
      ) {
        await updateAttendance(
          from,
          "maybe"
        );

        await sendText(
          from,
          "Asante kwa taarifa yako. Tafadhali tupatie jibu lako litakapokuwa tayari. Karibu sana GeitaCard."
        );

        console.log("Sina uhakika response sent");

        return res.sendStatus(200);
      }

      /* ---------------------------------------------------
         UNKNOWN BUTTON
      --------------------------------------------------- */

      console.log(
        "Unknown button:",
        buttonId,
        buttonTitle
      );

      return res.sendStatus(200);
    }

    /* =====================================================
       INTERACTIVE BUTTON REPLY
    ===================================================== */

    if (
      message.type === "interactive" &&
      message.interactive?.type === "button_reply"
    ) {
      const buttonId =
        message.interactive.button_reply?.id || "";

      const buttonTitle =
        message.interactive.button_reply?.title || "";

      console.log("==============================================");
      console.log("INTERACTIVE BUTTON");
      console.log("BUTTON ID:", buttonId);
      console.log("BUTTON TITLE:", buttonTitle);
      console.log("==============================================");

      const normalizedId =
        buttonId.toLowerCase().trim();

      const normalizedTitle =
        buttonTitle.toLowerCase().trim();

      if (
        normalizedId === "nitashiriki" ||
        normalizedTitle === "nitashiriki"
      ) {
        await updateAttendance(
          from,
          "confirmed"
        );

        await sendText(
          from,
          "Asante kwa jibu lako. Karibu sana GeitaCard! Tunafurahi kuthibitisha kuwa utashiriki."
        );

        return res.sendStatus(200);
      }

      if (
        normalizedId === "sitashiriki" ||
        normalizedTitle === "sitashiriki"
      ) {
        await updateAttendance(
          from,
          "declined"
        );

        await sendText(
          from,
          "Asante kwa taarifa yako. Tumejua kuwa hutashiriki. Karibu tena wakati mwingine. GeitaCard."
        );

        return res.sendStatus(200);
      }

      if (
        normalizedId === "sina_uhakika" ||
        normalizedId === "sinauhakika" ||
        normalizedTitle === "sina uhakika"
      ) {
        await updateAttendance(
          from,
          "maybe"
        );

        await sendText(
          from,
          "Asante kwa taarifa yako. Tafadhali tupatie jibu lako litakapokuwa tayari. Karibu sana GeitaCard."
        );

        return res.sendStatus(200);
      }
    }

    /* =====================================================
       OTHER MESSAGE TYPES
    ===================================================== */

    console.log(
      "Unhandled message type:",
      message.type
    );

    return res.sendStatus(200);

  } catch (error) {
    console.error(
      "Webhook error:",
      error.response?.data || error.message
    );

    return res.sendStatus(200);
  }
});

/* =========================================================
   SEND INVITATION ENDPOINT
========================================================= */

/*
POST /send-invitation

JSON:

{
  "to": "2557XXXXXXXX",
  "name": "Rajabu",
  "code": "9749-KAMATI"
}
*/

app.post("/send-invitation", async (req, res) => {
  try {
    const {
      to,
      name,
      code
    } = req.body;

    /* -----------------------------------------------------
       VALIDATION
    ----------------------------------------------------- */

    if (!to || !name || !code) {
      return res.status(400).json({
        success: false,
        message: "to, name na code vinahitajika."
      });
    }

    console.log("==============================================");
    console.log("Sending invitation...");
    console.log("To:", to);
    console.log("Name:", name);
    console.log("Code:", code);
    console.log("==============================================");

    const result = await sendInvitation(
      to,
      name,
      code
    );

    const guest = await saveGuest(
      to,
      name,
      code
    );

    return res.status(200).json({
      success: true,
      result: result,
      guest: guest
    });

  } catch (error) {
    console.error(
      "Send invitation error:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      error:
        error.response?.data ||
        error.message
    });
  }
});

/* =========================================================
   BULK SEND FROM EXCEL / CSV
========================================================= */

/*
Optional endpoint.

Expected columns:

to
name
code
*/

app.post("/send-bulk", async (req, res) => {
  try {
    if (
      !req.body ||
      !Array.isArray(req.body.contacts)
    ) {
      return res.status(400).json({
        success: false,
        message: "Tuma contacts kama array."
      });
    }

    const contacts = req.body.contacts;
    const results = [];

    for (const contact of contacts) {
      const {
        to,
        name,
        code
      } = contact;

      if (!to || !name || !code) {
        results.push({
          to,
          name,
          code,
          success: false,
          error: "Missing to, name or code"
        });

        continue;
      }

      try {
        const result = await sendInvitation(
          to,
          name,
          code
        );

        results.push({
          to,
          name,
          code,
          success: true,
          result
        });

      } catch (error) {
        results.push({
          to,
          name,
          code,
          success: false,
          error:
            error.response?.data ||
            error.message
        });
      }

      /*
        Pause kidogo ili tusitume requests nyingi
        kwa wakati mmoja.
      */

      await new Promise(
        resolve => setTimeout(resolve, 500)
      );
    }

    return res.status(200).json({
      success: true,
      total: contacts.length,
      results: results
    });

  } catch (error) {
    console.error(
      "Bulk send error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* =========================================================
   START SERVER
========================================================= */

app.listen(PORT, () => {
  console.log("==============================================");
  console.log(`Server running on port ${PORT}`);
  console.log("Template:", TEMPLATE_NAME);
  console.log("Language:", TEMPLATE_LANGUAGE);
  console.log("==============================================");
});
