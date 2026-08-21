const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const TEMPLATE_NAME =
  process.env.TEMPLATE_NAME || "geitacard_invitation";

const TEMPLATE_LANGUAGE =
  process.env.TEMPLATE_LANGUAGE || "sw";

const INVITE_IMAGE_URL =
  process.env.INVITE_IMAGE_URL || process.env.INVITE_IMAGE;

const PORT = process.env.PORT || 10000;

const GRAPH_VERSION = "v23.0";


// =====================================================
// HOME
// =====================================================

app.get("/", (req, res) => {
  res.send("WhatsApp Webhook ya GeitaCard iko running!");
});


// =====================================================
// WHATSAPP WEBHOOK VERIFICATION
// =====================================================

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});


// =====================================================
// SEND TEXT MESSAGE
// =====================================================

async function sendText(to, text) {
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const response = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: "text",
      text: {
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

  console.log("Reply sent:", response.data);

  return response.data;
}


// =====================================================
// SEND INVITATION TEMPLATE
// =====================================================

async function sendInvitation(to, name, code) {
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const components = [];

  // Kama template yako ina picha kwenye header
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

  // Body variables:
  // {{1}} = jina
  // {{2}} = code

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
}


// =====================================================
// RECEIVE WHATSAPP MESSAGES
// =====================================================

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    console.log("======================================");
    console.log("Incoming WhatsApp message:");
    console.log(JSON.stringify(body, null, 2));
    console.log("======================================");

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

    if (!value.messages || !value.messages[0]) {
      return res.sendStatus(200);
    }

    const message = value.messages[0];
    const from = message.from;

    console.log("Message type:", message.type);
    console.log("From:", from);


    // =================================================
    // NORMAL TEXT MESSAGE
    // =================================================

    if (message.type === "text") {
      const text = message.text?.body || "";

      console.log("Text received:", text);

      return res.sendStatus(200);
    }


    // =================================================
    // BUTTON / INTERACTIVE REPLY
    // =================================================

    if (
      message.type === "interactive" &&
      message.interactive?.type === "button_reply"
    ) {
      const buttonId =
        message.interactive.button_reply.id;

      const buttonTitle =
        message.interactive.button_reply.title;

      console.log("BUTTON ID:", buttonId);
      console.log("BUTTON TITLE:", buttonTitle);


      // ===============================================
      // NITASHIRIKI
      // ===============================================

      if (
        buttonId === "nitashiriki" ||
        buttonTitle.toLowerCase() === "nitashiriki"
      ) {
        await sendText(
          from,
          "Asante kwa jibu lako, Karibu sana GeitaCard"
        );

        return res.sendStatus(200);
      }


      // ===============================================
      // SITASHIRIKI
      // ===============================================

      if (
        buttonId === "sitashiriki" ||
        buttonTitle.toLowerCase() === "sitashiriki"
      ) {
        await sendText(
          from,
          "Asante kwa taarifa yako. Karibu sana GeitaCard."
        );

        return res.sendStatus(200);
      }


      // ===============================================
      // SINA UHAKIKA
      // ===============================================

      if (
        buttonId === "sina_uhakika" ||
        buttonTitle.toLowerCase() === "sina uhakika"
      ) {
        await sendText(
          from,
          "Asante kwa taarifa yako. Tutafurahi kupata jibu lako baadaye. Karibu sana GeitaCard."
        );

        return res.sendStatus(200);
      }

      console.log("Unknown button:", buttonId);

      return res.sendStatus(200);
    }


    // =================================================
    // OTHER MESSAGE TYPES
    // =================================================

    console.log("Unhandled message type:", message.type);

    return res.sendStatus(200);

  } catch (error) {
    console.error(
      "Webhook error:",
      error.response?.data || error.message
    );

    // WhatsApp inahitaji webhook ipokee 200
    // hata kama processing imepata error
    return res.sendStatus(200);
  }
});


// =====================================================
// TEST SEND INVITATION
// =====================================================
//
// Mfano:
//
// POST /send-invitation
//
// JSON:
// {
//   "to": "2557XXXXXXXX",
//   "name": "Rajabu",
//   "code": "9749-KAMATI"
// }
//
// =====================================================

app.post("/send-invitation", async (req, res) => {
  try {
    const { to, name, code } = req.body;

    if (!to || !name || !code) {
      return res.status(400).json({
        success: false,
        message: "to, name na code vinahitajika."
      });
    }

    const result = await sendInvitation(
      to,
      name,
      code
    );

    return res.status(200).json({
      success: true,
      result
    });

  } catch (error) {
    console.error(
      "Send invitation error:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});


// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Template: ${TEMPLATE_NAME}`);
  console.log(`Language: ${TEMPLATE_LANGUAGE}`);
});
