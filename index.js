const express = require("express");
const axios = require("axios");
const XLSX = require("xlsx");
const crypto = require("crypto");
const QRCode = require("qrcode");
const sharp = require("sharp");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(express.json({ limit: "20mb" }));
app.use(express.static("public"));

/* =========================================================
   SUPABASE
========================================================= */

const SUPABASE_URL = process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "ERROR: SUPABASE_URL au SUPABASE_SERVICE_ROLE_KEY haipo."
  );
}

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
  process.env.TEMPLATE_NAME ||
  "geitacard_invitation";

const TEMPLATE_LANGUAGE =
  process.env.TEMPLATE_LANGUAGE ||
  "sw";

const GRAPH_VERSION =
  process.env.GRAPH_VERSION ||
  "v26.0";

const PORT =
  process.env.PORT ||
  10000;

/* =========================================================
   EVENT SYSTEM
========================================================= */

/*
   EVENT HII NDIYO EVENT YA DEFAULT.

   Kama Excel/CSV itakuwa na event_key,
   event hiyo itatumika.

   Kama event_key haipo,
   DEFAULT_EVENT itatumika.
*/

const DEFAULT_EVENT =
  process.env.DEFAULT_EVENT ||
  "DEFAULT_EVENT";


/*
   Safisha event key.

   Mfano:
   " Harusi 2026 "
   ->
   "Harusi_2026"
*/

function normalizeEventKey(eventKey) {

  const value =
    String(
      eventKey ||
      DEFAULT_EVENT
    )
      .trim();

  if (!value) {
    return DEFAULT_EVENT;
  }

  return value
    .replace(
      /\s+/g,
      "_"
    )
    .substring(
      0,
      100
    );
}

/* =========================================================
   STORAGE
========================================================= */

const STORAGE_BUCKET =
  process.env.STORAGE_BUCKET ||
  "guest-cards";

/* =========================================================
   QR POSITION
========================================================= */

const QR_X =
  Number(
    process.env.QR_X ||
    495
  );

const QR_Y =
  Number(
    process.env.QR_Y ||
    1185
  );

const QR_SIZE =
  Number(
    process.env.QR_SIZE ||
    175
  );

/* =========================================================
   SERVER START MESSAGE
========================================================= */

console.log(
  "=============================================="
);

console.log(
  "GeitaCard system starting..."
);

console.log(
  "Template:",
  TEMPLATE_NAME
);

console.log(
  "Language:",
  TEMPLATE_LANGUAGE
);

console.log(
  "Graph Version:",
  GRAPH_VERSION
);

console.log(
  "QR System: ENABLED"
);

console.log(
  "Manual Code Check-in: ENABLED"
);

console.log(
  "QR Check-in: ENABLED"
);

console.log(
  "Event System: ENABLED"
);

console.log(
  "Default Event:",
  DEFAULT_EVENT
);

console.log(
  "Storage Bucket:",
  STORAGE_BUCKET
);

console.log(
  "QR Position:",
  QR_X,
  QR_Y,
  QR_SIZE
);

console.log(
  "=============================================="
);

/* =========================================================
   HOME
========================================================= */

app.get(
  "/",
  (req, res) => {

    res.send(
      "GeitaCard system iko running!"
    );

  }
);

/* =========================================================
   WHATSAPP WEBHOOK VERIFICATION
========================================================= */

app.get(
  "/webhook",
  (req, res) => {

    const mode =
      req.query["hub.mode"];

    const token =
      req.query["hub.verify_token"];

    const challenge =
      req.query["hub.challenge"];

    console.log(
      "Webhook verification request received"
    );

    if (
      mode === "subscribe" &&
      token === VERIFY_TOKEN
    ) {

      console.log(
        "Webhook verified successfully"
      );

      return res
        .status(200)
        .send(challenge);

    }

    console.log(
      "Webhook verification failed"
    );

    return res.sendStatus(403);

  }
);

/* =========================================================
   NORMALIZE PHONE
========================================================= */

function normalizePhone(phone) {

  return String(
    phone || ""
  )
    .replace(
      /\D/g,
      ""
    );

}

/* =========================================================
   CREATE UNIQUE QR TOKEN
========================================================= */

function createQRToken() {

  return crypto.randomUUID();

}

/* =========================================================
   CREATE QR IMAGE
========================================================= */

async function createQRImage(
  qrToken
) {

  const qrBuffer =
    await QRCode.toBuffer(
      qrToken,
      {
        type: "png",
        width: QR_SIZE,
        margin: 2,
        errorCorrectionLevel: "H"
      }
    );

  return qrBuffer;

}

/* =========================================================
   DOWNLOAD ORIGINAL CARD
========================================================= */

async function downloadInvitationImage() {

  if (!INVITE_IMAGE_URL) {

    throw new Error(
      "INVITE_IMAGE_URL haijawekwa kwenye Render."
    );

  }

  console.log(
    "Downloading invitation template..."
  );

  const response =
    await axios.get(
      INVITE_IMAGE_URL,
      {
        responseType: "arraybuffer",
        timeout: 30000
      }
    );

  if (!response.data) {

    throw new Error(
      "Invitation image haikupatikana."
    );

  }

  return Buffer.from(
    response.data
  );

}

/* =========================================================
   CREATE CARD WITH QR
========================================================= */

async function createCardWithQR(
  qrToken
) {

  const originalImage =
    await downloadInvitationImage();

  const qrImage =
    await createQRImage(
      qrToken
    );

  const imageMetadata =
    await sharp(
      originalImage
    )
      .metadata();

  const imageWidth =
    imageMetadata.width ||
    1024;

  const imageHeight =
    imageMetadata.height ||
    1536;

  const baseWidth =
    1024;

  const baseHeight =
    1536;

  const scaleX =
    imageWidth /
    baseWidth;

  const scaleY =
    imageHeight /
    baseHeight;

  const finalX =
    Math.max(
      0,
      Math.round(
        QR_X *
        scaleX
      )
    );

  const finalY =
    Math.max(
      0,
      Math.round(
        QR_Y *
        scaleY
      )
    );

  const finalSize =
    Math.max(
      80,
      Math.round(
        QR_SIZE *
        Math.min(
          scaleX,
          scaleY
        )
      )
    );

  const resizedQR =
    await sharp(
      qrImage
    )
      .resize(
        finalSize,
        finalSize,
        {
          fit: "contain"
        }
      )
      .png()
      .toBuffer();

  const cardImage =
    await sharp(
      originalImage
    )
      .composite([
        {
          input:
            resizedQR,

          left:
            finalX,

          top:
            finalY
        }
      ])
      .png()
      .toBuffer();

  console.log(
    "Card with QR created:",
    finalX,
    finalY,
    finalSize
  );

  return cardImage;

}

/* =========================================================
   CREATE SAFE FILE NAME
========================================================= */

function safeFileName(
  value
) {

  return String(
    value || "guest"
  )
    .replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    )
    .substring(
      0,
      80
    );

}

/* =========================================================
   UPLOAD CARD TO SUPABASE STORAGE
========================================================= */

async function uploadCardToStorage(
  cardBuffer,
  name,
  code,
  qrToken,
  eventKey
) {

  const safeName =
    safeFileName(
      name
    );

  const safeCode =
    safeFileName(
      code
    );

  const safeEvent =
    safeFileName(
      eventKey
    );

  /*
    Event inawekwa kwenye path.

    Hii inaruhusu:
    Event A
    Event B

    kuwa na cards tofauti.
  */

  const filePath =
    `${safeEvent}/${safeCode}-${safeName}-${qrToken}.png`;

  console.log(
    "Uploading card to Storage:",
    filePath
  );

  const {
    error
  } =
    await supabase
      .storage
      .from(
        STORAGE_BUCKET
      )
      .upload(
        filePath,
        cardBuffer,
        {
          contentType:
            "image/png",

          upsert:
            false
        }
      );

  if (error) {

    console.error(
      "Storage upload error:",
      error.message
    );

    throw error;

  }

  const {
    data
  } =
    supabase
      .storage
      .from(
        STORAGE_BUCKET
      )
      .getPublicUrl(
        filePath
      );

  const publicUrl =
    data?.publicUrl;

  if (!publicUrl) {

    throw new Error(
      "Public URL ya kadi haikupatikana."
    );

  }

  console.log(
    "Card uploaded successfully."
  );

  console.log(
    "Card URL:",
    publicUrl
  );

  return {

    filePath:
      filePath,

    publicUrl:
      publicUrl

  };

}

/* =========================================================
   DELETE CARD FROM STORAGE
========================================================= */

async function deleteCardFromStorage(
  filePath
) {

  if (!filePath) {
    return;
  }

  try {

    const {
      error
    } =
      await supabase
        .storage
        .from(
          STORAGE_BUCKET
        )
        .remove([
          filePath
        ]);

    if (error) {

      console.error(
        "Storage cleanup error:",
        error.message
      );

      return;

    }

    console.log(
      "Unused card removed from Storage:",
      filePath
    );

  } catch (error) {

    console.error(
      "Storage cleanup exception:",
      error.message
    );

  }

}

/* =========================================================
   PREPARE PERSONAL CARD
========================================================= */

async function preparePersonalCard(
  name,
  code,
  eventKey
) {

  const qrToken =
    createQRToken();

  console.log(
    "Creating unique QR token for:",
    name,
    code,
    eventKey
  );

  console.log(
    "QR Token:",
    qrToken
  );

  const cardBuffer =
    await createCardWithQR(
      qrToken
    );

  const storage =
    await uploadCardToStorage(
      cardBuffer,
      name,
      code,
      qrToken,
      eventKey
    );

  return {

    qrToken:
      qrToken,

    cardBuffer:
      cardBuffer,

    cardImageUrl:
      storage.publicUrl,

    storagePath:
      storage.filePath

  };

}

/* =========================================================
   GET EXISTING GUEST
========================================================= */

async function getGuestByEventAndCode(
  eventKey,
  code
) {

  const {
    data,
    error
  } =
    await supabase
      .from(
        "guests"
      )
      .select("*")
      .eq(
        "event_key",
        eventKey
      )
      .eq(
        "guest_code",
        code
      )
      .maybeSingle();

  if (error) {

    console.error(
      "Find existing guest error:",
      error.message
    );

    throw error;

  }

  return data || null;

}

/* =========================================================
   SAVE / UPDATE GUEST
========================================================= */

async function saveGuest(
  to,
  name,
  code,
  qrToken,
  cardImageUrl,
  eventKey,
  storagePath
) {

  const phone =
    normalizePhone(
      to
    );

  const cleanEventKey =
    normalizeEventKey(
      eventKey
    );

  const invitationType =
    String(
      code || ""
    )
      .toUpperCase()
      .endsWith(
        "-KAMATI"
      )

      ? "KAMATI"

      : String(
          code || ""
        )
          .toUpperCase()
          .endsWith(
            "-SINGLE"
          )

        ? "SINGLE"

        : (
            process.env.INVITATION_TYPE ||
            "premium"
          );

  /*
    MUHIMU:

    Unique key sasa ni:

       event_key + guest_code

    Kwa hiyo:

    EVENT_A + 9752-SINGLE
       ni record moja

    EVENT_B + 9752-SINGLE
       ni record nyingine.

    Hii ndiyo inayoruhusu mtu mmoja
    kuwa na events mbili tofauti.
  */

  const {
    data,
    error
  } =
    await supabase
      .from(
        "guests"
      )
      .upsert(
        [
          {

            full_name:
              name,

            phone:
              phone,

            guest_code:
              code,

            event_key:
              cleanEventKey,

            qr_token:
              qrToken,

            card_image_url:
              cardImageUrl,

            storage_path:
              storagePath,

            invitation_type:
              invitationType

          }
        ],
        {
          onConflict:
            "event_key,guest_code",

          ignoreDuplicates:
            false
        }
      )
      .select()
      .single();

  if (error) {

    console.error(
      "Supabase save guest error:",
      error.message
    );

    throw error;

  }

  console.log(
    "Guest saved/updated:",
    data.full_name,
    data.guest_code,
    data.event_key
  );

  console.log(
    "QR Token:",
    data.qr_token
  );

  console.log(
    "Card URL:",
    data.card_image_url
  );

  return data;

}

/* =========================================================
   SEND TEXT MESSAGE
========================================================= */

async function sendText(
  to,
  text
) {

  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;

  try {

    const response =
      await axios.post(
        url,
        {

          messaging_product:
            "whatsapp",

          recipient_type:
            "individual",

          to:
            normalizePhone(
              to
            ),

          type:
            "text",

          text: {

            preview_url:
              false,

            body:
              text

          }

        },
        {

          headers: {

            Authorization:
              `Bearer ${WHATSAPP_TOKEN}`,

            "Content-Type":
              "application/json"

          }

        }
      );

    console.log(
      "Text reply sent:",
      response.data
    );

    return response.data;

  } catch (error) {

    console.error(
      "Text send error:",
      error.response?.data ||
      error.message
    );

    throw error;

  }

}

/* =========================================================
   SEND INVITATION TEMPLATE
========================================================= */

async function sendInvitation(
  to,
  name,
  code,
  cardImageUrl
) {

  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const components = [];

  const imageUrl =
    cardImageUrl ||
    INVITE_IMAGE_URL;

  /*
    HEADER IMAGE
  */

  if (imageUrl) {

    components.push({

      type:
        "header",

      parameters: [

        {

          type:
            "image",

          image: {

            link:
              imageUrl

          }

        }

      ]

    });

  }

  /*
    BODY

    {{1}} = Jina
    {{2}} = Code
  */

  components.push({

    type:
      "body",

    parameters: [

      {

        type:
          "text",

        text:
          String(
            name
          )

      },

      {

        type:
          "text",

        text:
          String(
            code
          )

      }

    ]

  });

  try {

    console.log(
      "Sending WhatsApp invitation..."
    );

    console.log(
      "Image URL:",
      imageUrl
    );

    const response =
      await axios.post(
        url,
        {

          messaging_product:
            "whatsapp",

          recipient_type:
            "individual",

          to:
            normalizePhone(
              to
            ),

          type:
            "template",

          template: {

            name:
              TEMPLATE_NAME,

            language: {

              code:
                TEMPLATE_LANGUAGE

            },

            components:
              components

          }

        },
        {

          headers: {

            Authorization:
              `Bearer ${WHATSAPP_TOKEN}`,

            "Content-Type":
              "application/json"

          }

        }
      );

    console.log(
      "Invitation sent:",
      response.data
    );

    return response.data;

  } catch (error) {

    console.error(
      "Invitation send error:",
      JSON.stringify(
        error.response?.data ||
        error.message,
        null,
        2
      )
    );

    throw error;

  }

}

/* =========================================================
   UPDATE ATTENDANCE
========================================================= */

async function updateAttendance(
  phone,
  status,
  eventKey
) {

  const normalizedPhone =
    normalizePhone(
      phone
    );

  const cleanEventKey =
    normalizeEventKey(
      eventKey
    );

  let query =
    supabase
      .from(
        "guests"
      )
      .select(
        "id, full_name, phone, guest_code, event_key"
      )
      .eq(
        "phone",
        normalizedPhone
      )
      .eq(
        "event_key",
        cleanEventKey
      )
      .order(
        "created_at",
        {
          ascending:
            false
        }
      )
      .limit(1)
      .maybeSingle();

  const {
    data: guest,
    error: findError
  } =
    await query;

  if (findError) {

    console.error(
      "Find guest error:",
      findError.message
    );

    return null;

  }

  if (!guest) {

    console.log(
      "Guest not found:",
      normalizedPhone,
      cleanEventKey
    );

    return null;

  }

  const {
    data,
    error
  } =
    await supabase
      .from(
        "guests"
      )
      .update({

        attendance_status:
          status

      })
      .eq(
        "id",
        guest.id
      )
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
    status,
    cleanEventKey
  );

  return data;

}

/* =========================================================
   PROCESS BUTTON REPLY
========================================================= */

async function processAttendanceReply(
  from,
  buttonId,
  buttonTitle,
  eventKey
) {

  const normalizedId =
    String(
      buttonId || ""
    )
      .toLowerCase()
      .trim();

  const normalizedTitle =
    String(
      buttonTitle || ""
    )
      .toLowerCase()
      .trim();

  if (
    normalizedId ===
      "nitashiriki" ||
    normalizedTitle ===
      "nitashiriki"
  ) {

    await updateAttendance(
      from,
      "confirmed",
      eventKey
    );

    await sendText(
      from,
      "Asante kwa jibu lako. Karibu sana GeitaCard! Tunafurahi kuthibitisha kuwa utashiriki."
    );

    return true;

  }

  if (
    normalizedId ===
      "sitashiriki" ||
    normalizedTitle ===
      "sitashiriki"
  ) {

    await updateAttendance(
      from,
      "declined",
      eventKey
    );

    await sendText(
      from,
      "Asante kwa taarifa yako. Tumejua kuwa hutashiriki. Karibu tena wakati mwingine. GeitaCard."
    );

    return true;

  }

  if (
    normalizedId ===
      "sina_uhakika" ||
    normalizedId ===
      "sinauhakika" ||
    normalizedTitle ===
      "sina uhakika"
  ) {

    await updateAttendance(
      from,
      "maybe",
      eventKey
    );

    await sendText(
      from,
      "Asante kwa taarifa yako. Tafadhali tupatie jibu lako litakapokuwa tayari. Karibu sana GeitaCard."
    );

    return true;

  }

  return false;

}

/* =========================================================
   WHATSAPP WEBHOOK
========================================================= */

app.post(
  "/webhook",
  async (req, res) => {

    try {

      const body =
        req.body;

      console.log(
        "=============================================="
      );

      console.log(
        "Incoming WhatsApp webhook"
      );

      console.log(
        JSON.stringify(
          body,
          null,
          2
        )
      );

      console.log(
        "=============================================="
      );

      if (
        body.object !==
          "whatsapp_business_account" ||
        !body.entry ||
        !body.entry[0]
      ) {

        return res.sendStatus(
          200
        );

      }

      const changes =
        body.entry[0].changes;

      if (
        !changes ||
        !changes[0]
      ) {

        return res.sendStatus(
          200
        );

      }

      const value =
        changes[0].value;

      /* STATUS */

      if (
        value.statuses &&
        value.statuses.length > 0
      ) {

        const status =
          value.statuses[0];

        console.log(
          "WhatsApp status:",
          status.status
        );

        if (
          status.errors
        ) {

          console.log(
            "Status errors:",
            JSON.stringify(
              status.errors,
              null,
              2
            )
          );

        }

        return res.sendStatus(
          200
        );

      }

      /* MESSAGE */

      if (
        !value.messages ||
        !value.messages[0]
      ) {

        return res.sendStatus(
          200
        );

      }

      const message =
        value.messages[0];

      const from =
        message.from;

      console.log(
        "Message type:",
        message.type
      );

      console.log(
        "From:",
        from
      );

      /*
        Kwa sasa webhook replies
        zitatumia DEFAULT_EVENT.

        Baadaye tunaweza kuweka event
        moja kwa moja ndani ya button ID.
      */

      const eventKey =
        normalizeEventKey(
          DEFAULT_EVENT
        );

      /* TEXT */

      if (
        message.type ===
        "text"
      ) {

        const text =
          message.text?.body ||
          "";

        console.log(
          "Text received:",
          text
        );

        return res.sendStatus(
          200
        );

      }

      /* OLD BUTTON */

      if (
        message.type ===
        "button"
      ) {

        const buttonId =
          message.button?.payload ||
          "";

        const buttonTitle =
          message.button?.text ||
          "";

        await processAttendanceReply(
          from,
          buttonId,
          buttonTitle,
          eventKey
        );

        return res.sendStatus(
          200
        );

      }

      /* INTERACTIVE BUTTON */

      if (
        message.type ===
          "interactive" &&
        message.interactive?.type ===
          "button_reply"
      ) {

        const buttonId =
          message
            .interactive
            .button_reply?.id ||
          "";

        const buttonTitle =
          message
            .interactive
            .button_reply?.title ||
          "";

        await processAttendanceReply(
          from,
          buttonId,
          buttonTitle,
          eventKey
        );

        return res.sendStatus(
          200
        );

      }

      console.log(
        "Unhandled message type:",
        message.type
      );

      return res.sendStatus(
        200
      );

    } catch (error) {

      console.error(
        "Webhook error:",
        error.response?.data ||
        error.message
      );

      return res.sendStatus(
        200
      );

    }

  }
);

/* =========================================================
   SEND SINGLE INVITATION
========================================================= */

app.post(
  "/send-invitation",
  async (req, res) => {

    let preparedCard =
      null;

    try {

      const {
        to,
        name,
        code,
        event_key
      } = req.body;

      if (
        !to ||
        !name ||
        !code
      ) {

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "to, name na code vinahitajika."

        });

      }

      const cleanTo =
        String(
          to
        ).trim();

      const cleanName =
        String(
          name
        ).trim();

      const cleanCode =
        String(
          code
        ).trim();

      const cleanEventKey =
        normalizeEventKey(
          event_key
        );

      console.log(
        "=============================================="
      );

      console.log(
        "Sending single invitation"
      );

      console.log(
        "To:",
        cleanTo
      );

      console.log(
        "Name:",
        cleanName
      );

      console.log(
        "Code:",
        cleanCode
      );

      console.log(
        "Event:",
        cleanEventKey
      );

      console.log(
        "=============================================="
      );

      /* 1. CREATE CARD */

      preparedCard =
        await preparePersonalCard(
          cleanName,
          cleanCode,
          cleanEventKey
        );

      /* 2. SEND WHATSAPP */

      const result =
        await sendInvitation(
          cleanTo,
          cleanName,
          cleanCode,
          preparedCard.cardImageUrl
        );

      /* 3. SAVE / UPDATE */

      const guest =
        await saveGuest(
          cleanTo,
          cleanName,
          cleanCode,
          preparedCard.qrToken,
          preparedCard.cardImageUrl,
          cleanEventKey,
          preparedCard.storagePath
        );

      return res.status(
        200
      ).json({

        success:
          true,

        event_key:
          cleanEventKey,

        result:
          result,

        guest:
          guest

      });

    } catch (error) {

      console.error(
        "Send invitation error:",
        error.response?.data ||
        error.message
      );

      if (
        preparedCard?.storagePath
      ) {

        await deleteCardFromStorage(
          preparedCard.storagePath
        );

      }

      return res.status(
        500
      ).json({

        success:
          false,

        error:
          error.response?.data ||
          error.message

      });

    }

  }
);

/* =========================================================
   BULK SEND
========================================================= */

app.post(
  "/send-bulk",
  async (req, res) => {

    try {

      if (
        !req.body ||
        !Array.isArray(
          req.body.contacts
        )
      ) {

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "Tuma contacts kama array."

        });

      }

      const contacts =
        req.body.contacts;

      if (
        contacts.length === 0
      ) {

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "Hakuna contact iliyotumwa."

        });

      }

      const results = [];

      console.log(
        "=============================================="
      );

      console.log(
        "BULK SEND STARTED"
      );

      console.log(
        "Total contacts:",
        contacts.length
      );

      console.log(
        "=============================================="
      );

      for (
        let i = 0;
        i < contacts.length;
        i++
      ) {

        const contact =
          contacts[i];

        const to =
          contact.to
            ? String(
                contact.to
              ).trim()
            : "";

        const name =
          contact.name
            ? String(
                contact.name
              ).trim()
            : "";

        const code =
          contact.code
            ? String(
                contact.code
              ).trim()
            : "";

        /*
          EVENT inaweza kutoka
          kwenye Excel/CSV.

          Kama haipo:
          DEFAULT_EVENT.
        */

        const eventKey =
          normalizeEventKey(
            contact.event_key ||
            contact.event ||
            DEFAULT_EVENT
          );

        if (
          !to ||
          !name ||
          !code
        ) {

          results.push({

            to:
              to,

            name:
              name,

            code:
              code,

            event_key:
              eventKey,

            success:
              false,

            error:
              "Namba, Jina na Code vinahitajika."

          });

          continue;

        }

        let preparedCard =
          null;

        try {

          console.log(
            "----------------------------------------------"
          );

          console.log(
            `Bulk ${i + 1}/${contacts.length}`
          );

          console.log(
            "To:",
            to
          );

          console.log(
            "Name:",
            name
          );

          console.log(
            "Code:",
            code
          );

          console.log(
            "Event:",
            eventKey
          );

          /* CREATE UNIQUE CARD */

          preparedCard =
            await preparePersonalCard(
              name,
              code,
              eventKey
            );

          console.log(
            "Unique QR generated:",
            preparedCard.qrToken
          );

          /* SEND */

          const whatsappResult =
            await sendInvitation(
              to,
              name,
              code,
              preparedCard.cardImageUrl
            );

          /* SAVE / UPDATE */

          const guest =
            await saveGuest(
              to,
              name,
              code,
              preparedCard.qrToken,
              preparedCard.cardImageUrl,
              eventKey,
              preparedCard.storagePath
            );

          results.push({

            to:
              to,

            name:
              name,

            code:
              code,

            event_key:
              eventKey,

            success:
              true,

            qr_token:
              preparedCard.qrToken,

            card_image_url:
              preparedCard.cardImageUrl,

            guest:
              guest,

            result:
              whatsappResult

          });

          console.log(
            "SUCCESS:",
            name,
            code,
            eventKey
          );

        } catch (error) {

          console.error(
            "Bulk item error:",
            error.response?.data ||
            error.message
          );

          if (
            preparedCard?.storagePath
          ) {

            await deleteCardFromStorage(
              preparedCard.storagePath
            );

          }

          results.push({

            to:
              to,

            name:
              name,

            code:
              code,

            event_key:
              eventKey,

            success:
              false,

            error:
              error.response?.data ||
              error.message

          });

        }

        if (
          i <
          contacts.length - 1
        ) {

          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                1000
              )
          );

        }

      }

      const successful =
        results.filter(
          item =>
            item.success
        ).length;

      const failed =
        results.filter(
          item =>
            !item.success
        ).length;

      console.log(
        "=============================================="
      );

      console.log(
        "BULK SEND COMPLETE"
      );

      console.log(
        "Total:",
        contacts.length
      );

      console.log(
        "Successful:",
        successful
      );

      console.log(
        "Failed:",
        failed
      );

      console.log(
        "=============================================="
      );

      return res.status(
        200
      ).json({

        success:
          true,

        total:
          contacts.length,

        successful:
          successful,

        failed:
          failed,

        results:
          results

      });

    } catch (error) {

      console.error(
        "Bulk send error:",
        error.response?.data ||
        error.message
      );

      return res.status(
        500
      ).json({

        success:
          false,

        error:
          error.response?.data ||
          error.message

      });

    }

  }
);

/* =========================================================
   ATTENDANCE DASHBOARD API
========================================================= */

app.get(
  "/api/attendance",
  async (req, res) => {

    try {

      const eventKey =
        normalizeEventKey(
          req.query.event_key
        );

      const {
        data,
        error
      } =
        await supabase
          .from(
            "attendance_list"
          )
          .select("*")
          .eq(
            "event_key",
            eventKey
          )
          .order(
            "created_at",
            {
              ascending:
                false
            }
          );

      if (error) {

        console.error(
          "Attendance API error:",
          error.message
        );

        return res.status(
          500
        ).json({

          success:
            false,

          error:
            error.message

        });

      }

      return res.status(
        200
      ).json({

        success:
          true,

        event_key:
          eventKey,

        total:
          data?.length || 0,

        guests:
          data || []

      });

    } catch (error) {

      console.error(
        "Attendance API error:",
        error.message
      );

      return res.status(
        500
      ).json({

        success:
          false,

        error:
          error.message

      });

    }

  }
);

/* =========================================================
   DOWNLOAD ATTENDANCE EXCEL
========================================================= */

app.get(
  "/api/attendance/export",
  async (req, res) => {

    try {

      const eventKey =
        normalizeEventKey(
          req.query.event_key
        );

      console.log(
        "Preparing attendance Excel for:",
        eventKey
      );

      const {
        data,
        error
      } =
        await supabase
          .from(
            "guests"
          )
          .select(
            "full_name, phone, guest_code, event_key, qr_token, card_image_url, invitation_type, attendance_status, scanned_at, created_at"
          )
          .eq(
            "event_key",
            eventKey
          )
          .order(
            "created_at",
            {
              ascending:
                false
            }
          );

      if (error) {

        console.error(
          "Excel Supabase error:",
          error.message
        );

        return res.status(
          500
        ).json({

          success:
            false,

          error:
            error.message

        });

      }

      const rows =
        (data || []).map(
          (guest, index) => ({

            "#":
              index + 1,

            "Jina":
              guest.full_name || "",

            "Simu":
              guest.phone || "",

            "Code":
              guest.guest_code || "",

            "Event":
              guest.event_key || "",

            "QR Token":
              guest.qr_token || "",

            "Card URL":
              guest.card_image_url || "",

            "Aina":
              guest.invitation_type || "",

            "Ushiriki":
              guest.attendance_status ===
              "confirmed"

                ? "Nitashiriki"

                : guest.attendance_status ===
                  "declined"

                  ? "Sitashiriki"

                  : guest.attendance_status ===
                    "maybe"

                    ? "Sina uhakika"

                    : "Pending",

            "Check-in":
              guest.scanned_at
                ? "Checked-in"
                : "Hajaingia",

            "Muda wa Check-in":
              guest.scanned_at
                ? new Date(
                    guest.scanned_at
                  ).toLocaleString(
                    "sw-TZ"
                  )
                : "",

            "Muda wa Kutengenezwa":
              guest.created_at
                ? new Date(
                    guest.created_at
                  ).toLocaleString(
                    "sw-TZ"
                  )
                : ""

          })
        );

      const worksheet =
        XLSX.utils.json_to_sheet(
          rows
        );

      worksheet["!cols"] = [

        { wch: 6 },
        { wch: 30 },
        { wch: 18 },
        { wch: 20 },
        { wch: 25 },
        { wch: 40 },
        { wch: 60 },
        { wch: 15 },
        { wch: 18 },
        { wch: 20 },
        { wch: 25 },
        { wch: 25 }

      ];

      const workbook =
        XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "Wahudhuriaji"
      );

      const buffer =
        XLSX.write(
          workbook,
          {
            type:
              "buffer",

            bookType:
              "xlsx"
          }
        );

      const filename =
        `GeitaCard_${safeFileName(eventKey)}_Wahudhuriaji.xlsx`;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );

      console.log(
        "Attendance Excel ready."
      );

      return res.send(
        buffer
      );

    } catch (error) {

      console.error(
        "Attendance Excel error:",
        error.message
      );

      return res.status(
        500
      ).json({

        success:
          false,

        error:
          error.message

      });

    }

  }
);

/* =========================================================
   MANUAL CHECK-IN BY CODE
========================================================= */

app.post(
  "/api/check-in",
  async (req, res) => {

    try {

      const {
        code,
        event_key
      } = req.body;

      if (!code) {

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "Code ya mgeni inahitajika."

        });

      }

      const guestCode =
        String(
          code
        ).trim();

      const eventKey =
        normalizeEventKey(
          event_key
        );

      console.log(
        "CHECK-IN CODE:",
        guestCode
      );

      console.log(
        "CHECK-IN EVENT:",
        eventKey
      );

      const {
        data: guest,
        error: findError
      } =
        await supabase
          .from(
            "guests"
          )
          .select("*")
          .eq(
            "guest_code",
            guestCode
          )
          .eq(
            "event_key",
            eventKey
          )
          .limit(1)
          .maybeSingle();

      if (findError) {

        console.error(
          "Check-in search error:",
          findError.message
        );

        return res.status(
          500
        ).json({

          success:
            false,

          message:
            findError.message

        });

      }

      if (!guest) {

        return res.status(
          404
        ).json({

          success:
            false,

          message:
            "Mgeni mwenye code hiyo hakupatikana kwenye event hii."

        });

      }

      if (
        guest.scanned_at
      ) {

        return res.status(
          409
        ).json({

          success:
            false,

          alreadyCheckedIn:
            true,

          message:
            "Mgeni huyu tayari ameshaingia ukumbini.",

          guest:
            guest

        });

      }

      const {
        data: updatedGuest,
        error: updateError
      } =
        await supabase
          .from(
            "guests"
          )
          .update({

            scanned_at:
              new Date().toISOString()

          })
          .eq(
            "id",
            guest.id
          )
          .select()
          .single();

      if (updateError) {

        console.error(
          "Check-in update error:",
          updateError.message
        );

        return res.status(
          500
        ).json({

          success:
            false,

          message:
            updateError.message

        });

      }

      console.log(
        "Guest checked in:",
        updatedGuest.full_name,
        updatedGuest.guest_code,
        updatedGuest.event_key
      );

      return res.status(
        200
      ).json({

        success:
          true,

        message:
          "Mgeni ameingia ukumbini.",

        guest:
          updatedGuest

      });

    } catch (error) {

      console.error(
        "Check-in error:",
        error.message
      );

      return res.status(
        500
      ).json({

        success:
          false,

        message:
          error.message

      });

    }

  }
);

/* =========================================================
   QR CODE CHECK-IN
========================================================= */

app.post(
  "/api/check-in-qr",
  async (req, res) => {

    try {

      const {
        qr_token
      } = req.body;

      if (!qr_token) {

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "QR Token inahitajika."

        });

      }

      const qrToken =
        String(
          qr_token
        ).trim();

      console.log(
        "QR CHECK-IN TOKEN:",
        qrToken
      );

      const {
        data: guest,
        error: findError
      } =
        await supabase
          .from(
            "guests"
          )
          .select("*")
          .eq(
            "qr_token",
            qrToken
          )
          .limit(1)
          .maybeSingle();

      if (findError) {

        console.error(
          "QR check-in search error:",
          findError.message
        );

        return res.status(
          500
        ).json({

          success:
            false,

          message:
            findError.message

        });

      }

      if (!guest) {

        return res.status(
          404
        ).json({

          success:
            false,

          message:
            "QR Code hii si ya mgeni aliyesajiliwa."

        });

      }

      if (
        guest.scanned_at
      ) {

        return res.status(
          409
        ).json({

          success:
            false,

          alreadyCheckedIn:
            true,

          message:
            "Mgeni huyu tayari ameshaingia ukumbini.",

          guest:
            guest

        });

      }

      const {
        data: updatedGuest,
        error: updateError
      } =
        await supabase
          .from(
            "guests"
          )
          .update({

            scanned_at:
              new Date().toISOString()

          })
          .eq(
            "id",
            guest.id
          )
          .select()
          .single();

      if (updateError) {

        console.error(
          "QR check-in update error:",
          updateError.message
        );

        return res.status(
          500
        ).json({

          success:
            false,

          message:
            updateError.message

        });

      }

      console.log(
        "QR CHECK-IN SUCCESS:",
        updatedGuest.full_name,
        updatedGuest.guest_code,
        updatedGuest.event_key
      );

      return res.status(
        200
      ).json({

        success:
          true,

        message:
          "QR Check-in imefanikiwa.",

        guest:
          updatedGuest

      });

    } catch (error) {

      console.error(
        "QR check-in error:",
        error.message
      );

      return res.status(
        500
      ).json({

        success:
          false,

        message:
          error.message

      });

    }

  }
);

/* =========================================================
   EVENTS LIST
========================================================= */

app.get(
  "/api/events",
  async (req, res) => {

    try {

      const {
        data,
        error
      } =
        await supabase
          .from(
            "guests"
          )
          .select(
            "event_key"
          )
          .not(
            "event_key",
            "is",
            null
          );

      if (error) {

        return res.status(
          500
        ).json({

          success:
            false,

          error:
            error.message

        });

      }

      const events =
        [
          ...new Set(
            (data || [])
              .map(
                item =>
                  item.event_key
              )
              .filter(Boolean)
          )
        ];

      return res.status(
        200
      ).json({

        success:
          true,

        default_event:
          DEFAULT_EVENT,

        events:
          events

      });

    } catch (error) {

      return res.status(
        500
      ).json({

        success:
          false,

        error:
          error.message

      });

    }

  }
);

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
  "/health",
  (req, res) => {

    res.status(
      200
    ).json({

      success:
        true,

      message:
        "GeitaCard server iko hai.",

      qr_system:
        "enabled",

      event_system:
        "enabled",

      default_event:
        DEFAULT_EVENT,

      storage_bucket:
        STORAGE_BUCKET

    });

  }
);

/* =========================================================
   START SERVER
========================================================= */

app.listen(
  PORT,
  () => {

    console.log(
      "=============================================="
    );

    console.log(
      `Server running on port ${PORT}`
    );

    console.log(
      "GeitaCard system READY"
    );

    console.log(
      "Template:",
      TEMPLATE_NAME
    );

    console.log(
      "Language:",
      TEMPLATE_LANGUAGE
    );

    console.log(
      "QR System: ENABLED"
    );

    console.log(
      "Manual Code Check-in: ENABLED"
    );

    console.log(
      "QR Check-in: ENABLED"
    );

    console.log(
      "Event System: ENABLED"
    );

    console.log(
      "Default Event:",
      DEFAULT_EVENT
    );

    console.log(
      "Storage Bucket:",
      STORAGE_BUCKET
    );

    console.log(
      "=============================================="
    );

  }
);
