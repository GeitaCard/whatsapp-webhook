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

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (
  !SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY
) {

  console.error(
    "ERROR: SUPABASE_URL au SUPABASE_SERVICE_ROLE_KEY haipo."
  );

}

const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  );


/* =========================================================
   ENVIRONMENT VARIABLES
========================================================= */

const VERIFY_TOKEN =
  process.env.VERIFY_TOKEN;

const WHATSAPP_TOKEN =
  process.env.WHATSAPP_TOKEN;

const PHONE_NUMBER_ID =
  process.env.PHONE_NUMBER_ID;

const INVITE_IMAGE_URL =
  process.env.INVITE_IMAGE_URL;

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
   HII NDIYO EVENT DEFAULT.

   Kama request haijatuma event_key,
   mfumo utatumia DEFAULT_EVENT.

   Mfano:

   EVENT A
   event_key = HARUSI_TWAIBA

   EVENT B
   event_key = SENDOFF_TWAIBA

   Mtu mmoja anaweza kuwa na:

   code = 9752-SINGLE
   event_key = HARUSI_TWAIBA

   na pia:

   code = 9752-SINGLE
   event_key = SENDOFF_TWAIBA

   bila duplicate conflict.
*/

const DEFAULT_EVENT =
  process.env.DEFAULT_EVENT ||
  "DEFAULT_EVENT";


/* =========================================================
   SUPABASE STORAGE
========================================================= */

const STORAGE_BUCKET =
  process.env.STORAGE_BUCKET ||
  "guest-cards";


/* =========================================================
   QR POSITION
========================================================= */

const QR_X =
  Number(
    process.env.QR_X || 495
  );

const QR_Y =
  Number(
    process.env.QR_Y || 1185
  );

const QR_SIZE =
  Number(
    process.env.QR_SIZE || 175
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
  "Storage Bucket:",
  STORAGE_BUCKET
);

console.log(
  "Default Event:",
  DEFAULT_EVENT
);

console.log(
  "QR Position:",
  QR_X,
  QR_Y,
  QR_SIZE
);

console.log(
  "WhatsApp Media Upload: ENABLED"
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
   NORMALIZE EVENT
========================================================= */

function normalizeEvent(eventKey) {

  const value =
    String(
      eventKey ||
      DEFAULT_EVENT
    )
      .trim();

  return value || DEFAULT_EVENT;

}


/* =========================================================
   CREATE UNIQUE QR TOKEN
========================================================= */

function createQRToken() {

  /*
    UUID ni unique.

    Kila KADI inapata QR Token yake.

    Hata kama:

    Mtu = Juma
    Code = 9752-SINGLE
    Event = HARUSI

    na

    Mtu = Juma
    Code = 9752-SINGLE
    Event = SENDOFF

    QR zao zitakuwa tofauti.
  */

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
        type:
          "png",

        width:
          QR_SIZE,

        margin:
          2,

        errorCorrectionLevel:
          "H"
      }
    );


  return qrBuffer;

}


/* =========================================================
   DOWNLOAD ORIGINAL CARD
========================================================= */

async function downloadInvitationImage() {

  if (
    !INVITE_IMAGE_URL
  ) {

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
        responseType:
          "arraybuffer",

        timeout:
          30000
      }
    );


  if (
    !response.data
  ) {

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

  /*
    1. Download background
    2. Generate unique QR
    3. Put QR juu ya kadi
    4. Return PNG
  */

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
        QR_X * scaleX
      )
    );


  const finalY =
    Math.max(
      0,
      Math.round(
        QR_Y * scaleY
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
          fit:
            "contain"
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
   CREATE SAFE STORAGE FILE NAME
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
    QR TOKEN inafanya kila file
    liwe unique.
  */

  const filePath =
    `${safeEvent}/${safeCode}-${safeName}-${qrToken}.png`;


  console.log(
    "Uploading card to Storage:",
    filePath
  );


  const {
    error
  } = await supabase
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


  if (
    !publicUrl
  ) {

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
    filePath,
    publicUrl
  };

}


/* =========================================================
   DELETE CARD FROM STORAGE
========================================================= */

async function deleteCardFromStorage(
  filePath
) {

  if (
    !filePath
  ) {

    return;

  }


  try {

    const {
      error
    } = await supabase
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

  /*
    HII NDIYO TOKEN YA KIPEKEE
    YA KADI HUSIKA.
  */

  const qrToken =
    createQRToken();


  console.log(
    "Creating unique QR token for:",
    name,
    code
  );

  console.log(
    "Event:",
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
   UPLOAD IMAGE TO WHATSAPP / META
========================================================= */

async function uploadMediaToWhatsApp(
  cardBuffer
) {

  /*
    MUHIMU:

    HATUTUMII tena:

    image: {
      link: Supabase URL
    }

    Badala yake:

    1. Tunapakia PNG moja kwa moja Meta.
    2. Meta inatupa media ID.
    3. Tunatumia media ID kwenye template.

    Hii inalenga kutatua:

    Error 131053
    Media upload error
    Downloading media from weblink failed
  */


  if (
    !WHATSAPP_TOKEN
  ) {

    throw new Error(
      "WHATSAPP_TOKEN haijawekwa."
    );

  }


  if (
    !PHONE_NUMBER_ID
  ) {

    throw new Error(
      "PHONE_NUMBER_ID haijawekwa."
    );

  }


  console.log(
    "Uploading personalized card directly to WhatsApp Media..."
  );


  /*
    Node.js 18+ ina FormData na Blob built-in.

    Kwa hiyo hakuna package nyingine
    inayohitajika hapa.
  */

  const form =
    new FormData();


  form.append(
    "messaging_product",
    "whatsapp"
  );


  form.append(
    "type",
    "image/png"
  );


  const blob =
    new Blob(
      [
        cardBuffer
      ],
      {
        type:
          "image/png"
      }
    );


  form.append(
    "file",
    blob,
    "geitacard.png"
  );


  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/media`;


  try {

    const response =
      await axios.post(
        url,
        form,
        {
          headers: {

            Authorization:
              `Bearer ${WHATSAPP_TOKEN}`

          },

          maxContentLength:
            Infinity,

          maxBodyLength:
            Infinity,

          timeout:
            60000
        }
      );


    const mediaId =
      response.data?.id;


    if (
      !mediaId
    ) {

      throw new Error(
        "WhatsApp Media ID haikurudi."
      );

    }


    console.log(
      "WhatsApp Media uploaded successfully."
    );

    console.log(
      "Media ID:",
      mediaId
    );


    return mediaId;


  } catch (error) {

    console.error(
      "WhatsApp Media upload error:",
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
   SAVE GUEST
========================================================= */

async function saveGuest(
  to,
  name,
  code,
  qrToken,
  cardImageUrl,
  eventKey
) {

  const phone =
    normalizePhone(
      to
    );


  const cleanEventKey =
    normalizeEvent(
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

    guest_code PEKE YAKE SI UNIQUE TENA.

    Unique sasa ni:

       event_key + guest_code

    Hivyo:

       EVENT A + 9752-SINGLE

       EVENT B + 9752-SINGLE

    zinaruhusiwa.
  */


  const {
    data,
    error
  } = await supabase

    .from(
      "guests"
    )

    .insert([
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

        invitation_type:
          invitationType,

        attendance_status:
          "pending"

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


  console.log(
    "Guest saved:",
    data.full_name,
    data.guest_code
  );

  console.log(
    "Event:",
    data.event_key
  );

  console.log(
    "QR Token saved:",
    data.qr_token
  );

  console.log(
    "Card URL saved:",
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
  mediaId
) {

  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;


  const components = [];


  /* -------------------------------------------------------
     HEADER IMAGE

     SASA TUNATUMIA MEDIA ID
     YA KADI HUSIKA.
  ------------------------------------------------------- */

  if (
    mediaId
  ) {

    components.push({

      type:
        "header",

      parameters: [

        {

          type:
            "image",

          image: {

            id:
              mediaId

          }

        }

      ]

    });

  }


  /* -------------------------------------------------------
     BODY VARIABLES

     {{1}} = Jina
     {{2}} = Code
  ------------------------------------------------------- */

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
      "Invitation sent successfully:",
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
      );


  /*
    Kama event_key imetumwa,
    attendance inakuwa event-specific.

    Kama haijatumwa,
    tunahifadhi tabia ya zamani:
    tunachukua record ya mwisho.
  */

  if (
    eventKey
  ) {

    query =
      query.eq(
        "event_key",
        normalizeEvent(
          eventKey
        )
      );

  }


  const {
    data: guest,
    error: findError
  } = await query

    .order(
      "created_at",
      {
        ascending:
          false
      }
    )

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
      "Guest not found:",
      normalizedPhone
    );

    return null;

  }


  const {
    data,
    error
  } = await supabase

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
    guest.event_key
  );


  return data;

}


/* =========================================================
   PROCESS BUTTON REPLY
========================================================= */

async function processAttendanceReply(
  from,
  buttonId,
  buttonTitle
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


  /* -------------------------------------------------------
     NITASHIRIKI
  ------------------------------------------------------- */

  if (
    normalizedId ===
      "nitashiriki" ||
    normalizedTitle ===
      "nitashiriki"
  ) {

    await updateAttendance(
      from,
      "confirmed"
    );


    await sendText(
      from,
      "Asante kwa jibu lako. Karibu sana GeitaCard! Tunafurahi kuthibitisha kuwa utashiriki."
    );


    return true;

  }


  /* -------------------------------------------------------
     SITASHIRIKI
  ------------------------------------------------------- */

  if (
    normalizedId ===
      "sitashiriki" ||
    normalizedTitle ===
      "sitashiriki"
  ) {

    await updateAttendance(
      from,
      "declined"
    );


    await sendText(
      from,
      "Asante kwa taarifa yako. Tumejua kuwa hutashiriki. Karibu tena wakati mwingine. GeitaCard."
    );


    return true;

  }


  /* -------------------------------------------------------
     SINA UHAKIKA
  ------------------------------------------------------- */

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
      "maybe"
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
   WHATSAPP WEBHOOK - RECEIVE MESSAGES
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


      /* ---------------------------------------------------
         STATUS
      --------------------------------------------------- */

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


      /* ---------------------------------------------------
         MESSAGE
      --------------------------------------------------- */

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


      /* ---------------------------------------------------
         TEXT
      --------------------------------------------------- */

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


      /* ---------------------------------------------------
         OLD BUTTON FORMAT
      --------------------------------------------------- */

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
          buttonTitle
        );


        return res.sendStatus(
          200
        );

      }


      /* ---------------------------------------------------
         INTERACTIVE BUTTON
      --------------------------------------------------- */

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
          buttonTitle
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
        normalizeEvent(
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


      /* ---------------------------------------------------
         1. CREATE PERSONAL QR + CARD
      --------------------------------------------------- */

      preparedCard =
        await preparePersonalCard(
          cleanName,
          cleanCode,
          cleanEventKey
        );


      /* ---------------------------------------------------
         2. UPLOAD CARD DIRECTLY TO WHATSAPP MEDIA
      --------------------------------------------------- */

      const mediaId =
        await uploadMediaToWhatsApp(
          preparedCard.cardBuffer
        );


      /* ---------------------------------------------------
         3. SEND PERSONAL CARD USING MEDIA ID
      --------------------------------------------------- */

      const result =
        await sendInvitation(
          cleanTo,
          cleanName,
          cleanCode,
          mediaId
        );


      /* ---------------------------------------------------
         4. SAVE GUEST
      --------------------------------------------------- */

      const guest =
        await saveGuest(
          cleanTo,
          cleanName,
          cleanCode,
          preparedCard.qrToken,
          preparedCard.cardImageUrl,
          cleanEventKey
        );


      return res.status(
        200
      ).json({

        success:
          true,

        event_key:
          cleanEventKey,

        media_id:
          mediaId,

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


      /*
        Kama process imefeli,
        futa kadi ya Storage ambayo
        haikutumika.
      */

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


      /* ---------------------------------------------------
         PROCESS ONE BY ONE
      --------------------------------------------------- */

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
          EVENT KEY:

          Excel/CSV inaweza kuwa na:

          event_key

          Kama haipo,
          DEFAULT_EVENT itatumika.
        */

        const eventKey =
          normalizeEvent(
            contact.event_key
          );


        /* -------------------------------------------------
           VALIDATION
        ------------------------------------------------- */

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


          /* ---------------------------------------------
             1. CREATE UNIQUE QR + PERSONAL CARD
          --------------------------------------------- */

          preparedCard =
            await preparePersonalCard(
              name,
              code,
              eventKey
            );


          console.log(
            "Unique QR generated:"
          );

          console.log(
            preparedCard.qrToken
          );


          /* ---------------------------------------------
             2. UPLOAD PERSONAL CARD TO WHATSAPP MEDIA
          --------------------------------------------- */

          const mediaId =
            await uploadMediaToWhatsApp(
              preparedCard.cardBuffer
            );


          console.log(
            "WhatsApp Media ID:"
          );

          console.log(
            mediaId
          );


          /* ---------------------------------------------
             3. SEND PERSONAL CARD
          --------------------------------------------- */

          const whatsappResult =
            await sendInvitation(
              to,
              name,
              code,
              mediaId
            );


          /* ---------------------------------------------
             4. SAVE GUEST
          --------------------------------------------- */

          const guest =
            await saveGuest(
              to,
              name,
              code,
              preparedCard.qrToken,
              preparedCard.cardImageUrl,
              eventKey
            );


          /* ---------------------------------------------
             5. RESULT
          --------------------------------------------- */

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

            media_id:
              mediaId,

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


          /*
            Ondoa card ikiwa item
            imeshindikana.
          */

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


        /*
          Pause ya sekunde 1
          kati ya message.
        */

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


      /* ---------------------------------------------------
         SUMMARY
      --------------------------------------------------- */

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

      const {
        data,
        error
      } = await supabase

        .from(
          "attendance_list"
        )

        .select("*")

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

      console.log(
        "Preparing attendance Excel..."
      );


      const {
        data,
        error
      } = await supabase

        .from(
          "guests"
        )

        .select(
          "full_name, phone, guest_code, event_key, qr_token, card_image_url, invitation_type, attendance_status, scanned_at, created_at"
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

        {
          wch:
            6
        },

        {
          wch:
            30
        },

        {
          wch:
            18
        },

        {
          wch:
            20
        },

        {
          wch:
            25
        },

        {
          wch:
            40
        },

        {
          wch:
            60
        },

        {
          wch:
            15
        },

        {
          wch:
            18
        },

        {
          wch:
            20
        },

        {
          wch:
            25
        }

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
        "GeitaCard_Wahudhuriaji.xlsx";


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


      if (
        !code
      ) {

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


      const cleanEventKey =
        event_key
          ? normalizeEvent(
              event_key
            )
          : null;


      console.log(
        "CHECK-IN CODE:",
        guestCode
      );

      console.log(
        "CHECK-IN EVENT:",
        cleanEventKey ||
        "LATEST
