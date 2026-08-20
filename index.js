const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json());

// ===============================
// ENVIRONMENT VARIABLES
// ===============================

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// URL ya picha ya kadi.
// WEKA URL YA PICHA YAKO KWENYE RENDER ENVIRONMENT VARIABLES
const INVITE_IMAGE_URL = process.env.INVITE_IMAGE_URL;

// WhatsApp Cloud API
const WHATSAPP_API_URL =
  `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`;

// ===============================
// HOME
// ===============================

app.get("/", (req, res) => {
  res.send("WhatsApp Webhook is running!");
});

// ===============================
// WHATSAPP WEBHOOK VERIFICATION
// ===============================

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully!");
    return res.status(200).send(challenge);
  }

  console.log("Webhook verification failed.");
  return res.sendStatus(403);
});

// ===============================
// SEND MESSAGE FUNCTION
// ===============================

async function sendWhatsAppMessage(to, message) {
  try {
    const response = await axios.post(
      WHATSAPP_API_URL,
      message,
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("WhatsApp message sent:", response.data);

  } catch (error) {
    console.error(
      "WhatsApp send error:",
      error.response?.data || error.message
    );
  }
}

// ===============================
// SEND INVITATION
// ===============================

async function sendInvitation(to) {
  const message = {
    messaging_product: "whatsapp",
    to: to,
    type: "interactive",
    interactive: {
      type: "button",

      header: {
        type: "image",
        image: {
          link: INVITE_IMAGE_URL
        }
      },

      body: {
        text:
          "KADI YA MWALIKO\n\n" +
          "Code: 9749-KAMATI\n\n" +
          "Tafadhali kumbuka kufika na kadi hii ukumbini.\n" +
          "Karibu sana.\n\n" +
          "Tafadhali thibitisha ushiriki wako:"
      },

      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "NITASHIRIKI",
              title: "Nitashiriki"
            }
          },
          {
            type: "reply",
            reply: {
              id: "SITASHIRIKI",
              title: "Sitashiriki"
            }
          },
          {
            type: "reply",
            reply: {
              id: "SINA_UHAKIKA",
              title: "Sina uhakika"
            }
          }
        ]
      }
    }
  };

  await sendWhatsAppMessage(to, message);
}

// ===============================
// SEND RESPONSE AFTER BUTTON
// ===============================

async function sendParticipationResponse(to, responseText) {
  const message = {
    messaging_product: "whatsapp",
    to: to,
    type: "text",
    text: {
      body: responseText
    }
  };

  await sendWhatsAppMessage(to, message);
}

// ===============================
// RECEIVE WHATSAPP MESSAGES
// ===============================

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    console.log(
      "Incoming WhatsApp message:",
      JSON.stringify(body, null, 2)
    );

    // Hakikisha ni WhatsApp message
    if (
      body.object &&
      body.entry &&
      body.entry[0]?.changes &&
      body.entry[0].changes[0]?.value
    ) {
      const value = body.entry[0].changes[0].value;

      const message = value.messages?.[0];

      // Hakuna message, labda ni status update
      if (!message) {
        return res.sendStatus(200);
      }

      const from = message.from;

      // ==========================================
      // MTU AKITUMA UJUMBE WA KAWAIDA
      // ==========================================

      if (message.type === "text") {
        const text = message.text?.body?.trim().toLowerCase();

        console.log(`Message from ${from}: ${text}`);

        // Maneno yanayoweza kuanzisha kadi
        if (
          text === "habari" ||
          text === "hi" ||
          text === "hello" ||
          text === "mwaliko" ||
          text === "kadi" ||
          text === "karibu"
        ) {
          await sendInvitation(from);
        } else {
          await sendParticipationResponse(
            from,
            "Habari 👋 Karibu GeitaCard.\n\n" +
            "Tafadhali andika *MWALIKO* kupata kadi ya mwaliko."
          );
        }
      }

      // ==========================================
      // MTU AKIBONYEZA BUTTON
      // ==========================================

      if (message.type === "interactive") {
        const interactive = message.interactive;

        // Button reply
        if (interactive?.type === "button_reply") {
          const buttonId = interactive.button_reply?.id;

          console.log(
            `Button selected by ${from}: ${buttonId}`
          );

          // ------------------------------
          // NITASHIRIKI
          // ------------------------------

          if (buttonId === "NITASHIRIKI") {
            await sendParticipationResponse(
              from,
              "Asante kwa jibu lako 🙏, Karibu sana GeitaCard."
            );
          }

          // ------------------------------
          // SITASHIRIKI
          // ------------------------------

          else if (buttonId === "SITASHIRIKI") {
            await sendParticipationResponse(
              from,
              "Asante kwa kutujulisha 🙏.\n" +
              "Tunakushukuru kwa muda wako. Karibu sana GeitaCard."
            );
          }

          // ------------------------------
          // SINA UHAKIKA
          // ------------------------------

          else if (buttonId === "SINA_UHAKIKA") {
            await sendParticipationResponse(
              from,
              "Asante kwa taarifa yako 🙏.\n" +
              "Ukishapata uhakika, tafadhali tujulishe."
            );
          }
        }
      }
    }

    // WhatsApp inahitaji 200
    return res.sendStatus(200);

  } catch (error) {
    console.error(
      "Webhook error:",
      error.response?.data || error.message
    );

    return res.sendStatus(500);
  }
});

// ===============================
// START SERVER
// ===============================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
