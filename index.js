const express = require("express");
const axios = require("axios");
const XLSX = require("xlsx");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const PORT = process.env.PORT || 10000;

// ----------------------------------------------------
// HOME
// ----------------------------------------------------

app.get("/", (req, res) => {
  res.send("WhatsApp Webhook ya GeitaCard iko running!");
});

// ----------------------------------------------------
// WHATSAPP WEBHOOK VERIFICATION
// ----------------------------------------------------

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

// ----------------------------------------------------
// RECEIVE WHATSAPP MESSAGES
// ----------------------------------------------------

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    console.log("Incoming WhatsApp message:");
    console.log(JSON.stringify(body, null, 2));

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

    // ------------------------------------------------
    // TEXT MESSAGE
    // ------------------------------------------------

    if (message.type === "text") {
      const text = message.text.body.trim().toLowerCase();

      console.log("Text received:", text);

      if (
        text.includes("nitashiriki") ||
        text.includes("nitashiriki")
      ) {
        await sendText(
          from,
          "Asante kwa jibu lako, Karibu sana GeitaCard."
        );
      } else if (
        text.includes("sitashiriki")
      ) {
        await sendText(
          from,
          "Asante kwa kutujulisha. Tunakushukuru kwa muda wako."
        );
      } else if (
        text.includes("sina uhakika")
      ) {
        await sendText(
          from,
          "Asante kwa jibu lako. Tutafurahi kukupokea utakapokuwa tayari."
        );
      }
    }

    // ------------------------------------------------
    // BUTTON REPLY
    // ------------------------------------------------

    if (message.type === "button") {
      const buttonText = message.button.text;
      const buttonId = message.button.payload;

      console.log("Button clicked:", buttonText);
      console.log("Button ID:", buttonId);

      await handleReply(from, buttonId, buttonText);
    }

    // ------------------------------------------------
    // INTERACTIVE REPLY
    // ------------------------------------------------

    if (message.type === "interactive") {
      const interactive = message.interactive;

      if (interactive.type === "button_reply") {
        const buttonId = interactive.button_reply.id;
        const buttonTitle = interactive.button_reply.title;

        console.log("Interactive button:", buttonTitle);
        console.log("Button ID:", buttonId);

        await handleReply(from, buttonId, buttonTitle);
      }
    }

    return res.sendStatus(200);

  } catch (error) {
    console.error(
      "Webhook error:",
      error.response?.data || error.message
    );

    return res.sendStatus(500);
  }
});

// ----------------------------------------------------
// HANDLE OPTIONS
// ----------------------------------------------------

async function handleReply(from, buttonId, buttonText) {

  // NITASHIRIKI
  if (
    buttonId === "NITASHIRIKI" ||
    buttonText.toLowerCase().includes("nitashiriki")
  ) {
    await sendText(
      from,
      "Asante kwa jibu lako, Karibu sana GeitaCard."
    );

    console.log(`${from} amechagua NITASHIRIKI`);

    return;
  }

  // SITASHIRIKI
  if (
    buttonId === "SITASHIRIKI" ||
    buttonText.toLowerCase().includes("sitashiriki")
  ) {
    await sendText(
      from,
      "Asante kwa kutujulisha. Tunakushukuru kwa muda wako."
    );

    console.log(`${from} amechagua SITASHIRIKI`);

    return;
  }

  // SINA UHAKIKA
  if (
    buttonId === "SINA_UHAKIKA" ||
    buttonText.toLowerCase().includes("sina uhakika")
  ) {
    await sendText(
      from,
      "Asante kwa jibu lako. Tutafurahi kukupokea utakapokuwa tayari."
    );

    console.log(`${from} amechagua SINA UHAKIKA`);

    return;
  }

  console.log("Unknown button:", buttonId);
}

// ----------------------------------------------------
// SEND TEXT MESSAGE
// ----------------------------------------------------

async function sendText(to, message) {

  const url =
    `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`;

  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: "text",
      text: {
        body: message
      }
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ----------------------------------------------------
// SEND TEMPLATE MESSAGE
// ----------------------------------------------------

async function sendInvitation(person) {

  const url =
    `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`;

  /*
    TEMPLATE NAME:
    geitacard_invitation

    Badilisha jina hili liwe jina halisi la
    WhatsApp approved template yako.
  */

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: person.phone,

    type: "template",

    template: {
      name: "geitacard_invitation",

      language: {
        code: "sw"
      },

      components: [

        // --------------------------------------------
        // HEADER - IMAGE
        // --------------------------------------------

        {
          type: "header",

          parameters: [
            {
              type: "image",

              image: {
                link: process.env.CARD_IMAGE_URL
              }
            }
          ]
        },

        // --------------------------------------------
        // BODY
        // --------------------------------------------

        {
          type: "body",

          parameters: [
            {
              type: "text",
              text: person.name
            },
            {
              type: "text",
              text: person.code
            }
          ]
        },

        // --------------------------------------------
        // BUTTON 1
        // --------------------------------------------

        {
          type: "button",

          sub_type: "quick_reply",

          index: "0",

          parameters: [
            {
              type: "payload",
              payload: "NITASHIRIKI"
            }
          ]
        },

        // --------------------------------------------
        // BUTTON 2
        // --------------------------------------------

        {
          type: "button",

          sub_type: "quick_reply",

          index: "1",

          parameters: [
            {
              type: "payload",
              payload: "SITASHIRIKI"
            }
          ]
        },

        // --------------------------------------------
        // BUTTON 3
        // --------------------------------------------

        {
          type: "button",

          sub_type: "quick_reply",

          index: "2",

          parameters: [
            {
              type: "payload",
              payload: "SINA_UHAKIKA"
            }
          ]
        }
      ]
    }
  };

  const response = await axios.post(
    url,
    payload,
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );

  return response.data;
}

// ----------------------------------------------------
// READ EXCEL FILE
// ----------------------------------------------------

function readExcel() {

  const workbook = XLSX.readFile("contacts.xlsx");

  const sheetName = workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json(sheet);

  return rows;
}

// ----------------------------------------------------
// SEND BULK FROM EXCEL
// ----------------------------------------------------

app.get("/send-bulk", async (req, res) => {

  try {

    const people = readExcel();

    if (!people.length) {
      return res.status(400).json({
        success: false,
        message: "contacts.xlsx haina watu."
      });
    }

    const results = [];

    for (const person of people) {

      if (!person.phone) {
        results.push({
          name: person.name || "",
          status: "FAILED",
          reason: "Phone number haipo"
        });

        continue;
      }

      try {

        const result = await sendInvitation({
          name: person.name,
          code: person.code,
          phone: person.phone
        });

        results.push({
          name: person.name,
          phone: person.phone,
          code: person.code,
          status: "SENT",
          result
        });

        console.log(
          `Sent to ${person.name} - ${person.phone}`
        );

        // --------------------------------------------
        // PAUSE KIDOGO KUEPUKA KUTUMA HARAKA SANA
        // --------------------------------------------

        await sleep(1500);

      } catch (error) {

        console.error(
          `Failed ${person.name}:`,
          error.response?.data || error.message
        );

        results.push({
          name: person.name,
          phone: person.phone,
          code: person.code,
          status: "FAILED",
          error:
            error.response?.data || error.message
        });
      }
    }

    return res.json({
      success: true,
      total: people.length,
      results
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ----------------------------------------------------
// TEST SINGLE PERSON
// ----------------------------------------------------

app.get("/send-test", async (req, res) => {

  try {

    const person = {
      name: req.query.name || "Twaiwa Swaibu",
      code: req.query.code || "9749-KAMATI",
      phone: req.query.phone
    };

    if (!person.phone) {
      return res.status(400).json({
        success: false,
        message:
          "Weka phone kwenye URL. Mfano /send-test?phone=2557XXXXXXXX"
      });
    }

    const result = await sendInvitation(person);

    return res.json({
      success: true,
      message: "Invitation imetumwa.",
      result
    });

  } catch (error) {

    console.error(
      error.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      error:
        error.response?.data || error.message
    });
  }
});

// ----------------------------------------------------
// SLEEP FUNCTION
// ----------------------------------------------------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ----------------------------------------------------
// START SERVER
// ----------------------------------------------------

app.listen(PORT, () => {

  console.log(
    `Server running on port ${PORT}`
  );

});
