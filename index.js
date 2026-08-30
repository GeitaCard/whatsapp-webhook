const express = require("express");
const axios = require("axios");
const XLSX = require("xlsx");
const crypto = require("crypto");
const QRCode = require("qrcode");
const sharp = require("sharp");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();

/* =========================================================
   BASIC CONFIG
========================================================= */

app.use(express.json({ limit: "40mb" }));
app.use(express.urlencoded({ extended: true, limit: "40mb" }));

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

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
  process.env.VERIFY_TOKEN || "";

const WHATSAPP_TOKEN =
  process.env.WHATSAPP_TOKEN || "";

const PHONE_NUMBER_ID =
  process.env.PHONE_NUMBER_ID || "";

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

const STORAGE_BUCKET =
  process.env.STORAGE_BUCKET ||
  "guest-cards";

/*
  IMPORTANT:

  Hakuna DEFAULT_EVENT.

  Kila request ya invitation,
  bulk na manual check-in
  lazima ijue Event.
*/

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
   STARTUP LOG
========================================================= */

console.log(
  "=============================================="
);

console.log(
  "GeitaCard System Starting..."
);

console.log(
  "Event System: ENABLED"
);

console.log(
  "Event Card Upload: ENABLED"
);

console.log(
  "Strict Multi Event: ENABLED"
);

console.log(
  "Excel/CSV Bulk: ENABLED"
);

console.log(
  "WhatsApp Bulk: ENABLED"
);

console.log(
  "Manual Code Check-in: ENABLED"
);

console.log(
  "QR Check-in: ENABLED"
);

console.log(
  "Dashboard: ENABLED"
);

console.log(
  "Default Event: DISABLED"
);

console.log(
  "Storage Bucket:",
  STORAGE_BUCKET
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

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );

  }
);

/* =========================================================
   HEALTH
========================================================= */

app.get(
  "/health",
  (req, res) => {

    res.status(200).json({

      success:
        true,

      message:
        "GeitaCard server iko hai.",

      event_system:
        "enabled",

      event_card_upload:
        "enabled",

      multi_event:
        "strict",

      bulk:
        "enabled",

      qr:
        "enabled",

      code_checkin:
        "enabled",

      dashboard:
        "enabled",

      default_event:
        "disabled",

      storage_bucket:
        STORAGE_BUCKET

    });

  }
);

/* =========================================================
   NORMALIZE PHONE
========================================================= */

function normalizePhone(phone) {

  let value =
    String(
      phone || ""
    )
      .trim();

  value =
    value.replace(
      /[\s()+-]/g,
      ""
    );

  /*
    Tanzania shortcut:

    0712345678
    -> 255712345678
  */

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

/* =========================================================
   NORMALIZE EVENT
========================================================= */

function normalizeEvent(eventKey) {

  const value =
    String(
      eventKey || ""
    )
      .trim()
      .toUpperCase();

  if (!value) {

    throw new Error(
      "Event Key inahitajika. Mfano: EVENT_A"
    );

  }

  if (
    !/^[A-Z0-9_-]+$/.test(
      value
    )
  ) {

    throw new Error(
      "Event Key inaweza kuwa na A-Z, 0-9, _ au - tu."
    );

  }

  return value;

}

/* =========================================================
   NORMALIZE CODE
========================================================= */

function normalizeCode(code) {

  return String(
    code || ""
  )
    .trim();

}

/* =========================================================
   SAFE FILE NAME
========================================================= */

function safeFileName(value) {

  return String(
    value || "file"
  )
    .replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    )
    .substring(
      0,
      100
    );

}

/* =========================================================
   QR TOKEN
========================================================= */

function createQRToken() {

  return crypto.randomUUID();

}

/* =========================================================
   INVITATION TYPE
========================================================= */

function getInvitationType(code) {

  const value =
    String(
      code || ""
    )
      .trim()
      .toUpperCase();

  if (
    value.endsWith(
      "-KAMATI"
    )
  ) {

    return "KAMATI";

  }

  if (
    value.endsWith(
      "-SINGLE"
    )
  ) {

    return "SINGLE";

  }

  return (
    process.env.INVITATION_TYPE ||
    "premium"
  );

}

/* =========================================================
   PARSE BASE64 IMAGE
========================================================= */

function parseBase64Image(value) {

  const text =
    String(
      value || ""
    ).trim();

  if (!text) {

    throw new Error(
      "Picha ya kadi haikutumwa."
    );

  }

  let mime =
    "image/png";

  let base64 =
    text;

  const match =
    text.match(
      /^data:([^;]+);base64,(.+)$/s
    );

  if (match) {

    mime =
      match[1];

    base64 =
      match[2];

  }

  if (
    !/^image\/(png|jpeg|jpg|webp)$/i.test(
      mime
    )
  ) {

    throw new Error(
      "Kadi inaruhusiwa PNG, JPG/JPEG au WEBP tu."
    );

  }

  const buffer =
    Buffer.from(
      base64,
      "base64"
    );

  if (
    !buffer.length
  ) {

    throw new Error(
      "Picha ya kadi ni tupu au imeharibika."
    );

  }

  return {
    buffer,
    mime
  };

}

/* =========================================================
   GET EVENT CONFIG
========================================================= */

async function getEventConfig(eventKey) {

  const cleanEvent =
    normalizeEvent(
      eventKey
    );

  const {
    data,
    error
  } =
    await supabase
      .from("events")
      .select(
        "id,event_key,event_name,card_image_url,template_name,template_language,is_active,created_at"
      )
      .eq(
        "event_key",
        cleanEvent
      )
      .eq(
        "is_active",
        true
      )
      .maybeSingle();

  if (error) {

    throw new Error(
      "Event lookup error: " +
      error.message
    );

  }

  if (!data) {

    throw new Error(
      `Event "${cleanEvent}" haipo au haijawekwa active.`
    );

  }

  if (
    String(
      data.event_key || ""
    )
      .trim()
      .toUpperCase() !==
    cleanEvent
  ) {

    throw new Error(
      `Security error: Event mismatch kwa ${cleanEvent}.`
    );

  }

  if (
    !data.card_image_url
  ) {

    throw new Error(
      `Event "${cleanEvent}" haina Kadi. Upload kadi kwanza.`
    );

  }

  return data;

}

/* =========================================================
   DELETE STORAGE FILE
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
        "Storage cleanup:",
        error.message
      );

    }

  } catch (error) {

    console.error(
      "Storage cleanup exception:",
      error.message
    );

  }

}

/* =========================================================
   EVENTS - GET
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
          .from("events")
          .select(
            "id,event_key,event_name,card_image_url,template_name,template_language,is_active,created_at"
          )
          .eq(
            "is_active",
            true
          )
          .order(
            "created_at",
            {
              ascending:
                false
            }
          );

      if (error) {
        throw error;
      }

      res.json({

        success:
          true,

        total:
          data?.length || 0,

        events:
          data || []

      });

    } catch (error) {

      console.error(
        "GET EVENTS:",
        error.message
      );

      res.status(500).json({

        success:
          false,

        error:
          error.message

      });

    }

  }
);

/* =========================================================
   CREATE EVENT + CARD
========================================================= */

app.post(
  "/api/events",
  async (req, res) => {

    let uploadedPath =
      null;

    try {

      const {

        event_key,

        event_name,

        template_name,

        template_language,

        card_image_base64,

        card_image_name

      } =
        req.body || {};


      if (!event_key) {

        return res.status(400).json({

          success:
            false,

          message:
            "Event Key inahitajika."

        });

      }


      const cleanKey =
        normalizeEvent(
          event_key
        );


      const cleanName =
        String(
          event_name ||
          cleanKey
        ).trim();


      if (!card_image_base64) {

        return res.status(400).json({

          success:
            false,

          message:
            "Tafadhali upload Kadi ya Event."

        });

      }


      /*
        CHECK DUPLICATE EVENT
      */

      const {
        data: existing,
        error: existingError
      } =
        await supabase
          .from("events")
          .select(
            "id,event_key"
          )
          .eq(
            "event_key",
            cleanKey
          )
          .maybeSingle();


      if (existingError) {
        throw existingError;
      }


      if (existing) {

        return res.status(409).json({

          success:
            false,

          message:
            `Event ${cleanKey} tayari ipo.`,

          event:
            existing

        });

      }


      /*
        PARSE IMAGE
      */

      const {
        buffer,
        mime
      } =
        parseBase64Image(
          card_image_base64
        );


      let extension =
        "png";


      if (
        mime.includes("jpeg") ||
        mime.includes("jpg")
      ) {

        extension =
          "jpg";

      }


      if (
        mime.includes("webp")
      ) {

        extension =
          "webp";

      }


      const originalName =
        safeFileName(
          card_image_name ||
          `${cleanKey}.${extension}`
        );


      const filePath =
        `events/${cleanKey}/${Date.now()}-${originalName}.${extension}`;


      /*
        UPLOAD EVENT CARD
      */

      const {
        error: uploadError
      } =
        await supabase
          .storage
          .from(
            STORAGE_BUCKET
          )
          .upload(
            filePath,
            buffer,
            {

              contentType:
                mime,

              upsert:
                false

            }
          );


      if (uploadError) {
        throw uploadError;
      }


      uploadedPath =
        filePath;


      /*
        PUBLIC URL
      */

      const {
        data: publicData
      } =
        supabase
          .storage
          .from(
            STORAGE_BUCKET
          )
          .getPublicUrl(
            filePath
          );


      const cardImageUrl =
        publicData?.publicUrl;


      if (!cardImageUrl) {

        throw new Error(
          "Public URL ya kadi haikupatikana."
        );

      }


      /*
        SAVE EVENT
      */

      const {
        data,
        error
      } =
        await supabase
          .from("events")
          .insert([{

            event_key:
              cleanKey,

            event_name:
              cleanName,

            card_image_url:
              cardImageUrl,

            template_name:
              String(
                template_name ||
                TEMPLATE_NAME
              ).trim(),

            template_language:
              String(
                template_language ||
                TEMPLATE_LANGUAGE
              ).trim(),

            is_active:
              true

          }])
          .select()
          .single();


      if (error) {
        throw error;
      }


      uploadedPath =
        null;


      res.status(201).json({

        success:
          true,

        message:
          `Event ${cleanKey} imeundwa na Kadi imehifadhiwa.`,

        event:
          data

      });


    } catch (error) {

      if (uploadedPath) {

        await deleteCardFromStorage(
          uploadedPath
        );

      }


      console.error(
        "CREATE EVENT:",
        error.message
      );


      res.status(500).json({

        success:
          false,

        error:
          error.message

      });

    }

  }
);

/* =========================================================
   UPDATE EVENT
========================================================= */

app.put(
  "/api/events/:id",
  async (req, res) => {

    try {

      const id =
        req.params.id;

      const {
        event_key,
        event_name,
        template_name,
        template_language,
        is_active
      } =
        req.body || {};

      const updates = {};


      if (
        event_key !==
        undefined
      ) {

        updates.event_key =
          normalizeEvent(
            event_key
          );

      }


      if (
        event_name !==
        undefined
      ) {

        updates.event_name =
          String(
            event_name
          ).trim();

      }


      if (
        template_name !==
        undefined
      ) {

        updates.template_name =
          String(
            template_name
          ).trim();

      }


      if (
        template_language !==
        undefined
      ) {

        updates.template_language =
          String(
            template_language
          ).trim();

      }


      if (
        is_active !==
        undefined
      ) {

        updates.is_active =
          Boolean(
            is_active
          );

      }


      const {
        data,
        error
      } =
        await supabase
          .from("events")
          .update(
            updates
          )
          .eq(
            "id",
            id
          )
          .select()
          .single();


      if (error) {
        throw error;
      }


      res.json({

        success:
          true,

        message:
          "Event imebadilishwa.",

        event:
          data

      });


    } catch (error) {

      res.status(500).json({

        success:
          false,

        error:
          error.message

      });

    }

  }
);

/* =========================================================
   CHANGE EVENT CARD
========================================================= */

app.post(
  "/api/events/:id/card",
  async (req, res) => {

    let uploadedPath =
      null;

    try {

      const id =
        req.params.id;


      const {
        card_image_base64,
        card_image_name
      } =
        req.body || {};


      if (!card_image_base64) {

        return res.status(400).json({

          success:
            false,

          message:
            "Tafadhali upload picha ya Kadi."

        });

      }


      const {
        data: event,
        error: eventError
      } =
        await supabase
          .from("events")
          .select(
            "id,event_key,event_name,card_image_url"
          )
          .eq(
            "id",
            id
          )
          .maybeSingle();


      if (eventError) {
        throw eventError;
      }


      if (!event) {

        return res.status(404).json({

          success:
            false,

          message:
            "Event haikupatikana."

        });

      }


      const {
        buffer,
        mime
      } =
        parseBase64Image(
          card_image_base64
        );


      let extension =
        "png";


      if (
        mime.includes("jpeg") ||
        mime.includes("jpg")
      ) {

        extension =
          "jpg";

      }


      if (
        mime.includes("webp")
      ) {

        extension =
          "webp";

      }


      const originalName =
        safeFileName(
          card_image_name ||
          `${event.event_key}.${extension}`
        );


      const filePath =
        `events/${safeFileName(
          event.event_key
        )}/${Date.now()}-${originalName}.${extension}`;


      const {
        error: uploadError
      } =
        await supabase
          .storage
          .from(
            STORAGE_BUCKET
          )
          .upload(
            filePath,
            buffer,
            {

              contentType:
                mime,

              upsert:
                false

            }
          );


      if (uploadError) {
        throw uploadError;
      }


      uploadedPath =
        filePath;


      const {
        data: publicData
      } =
        supabase
          .storage
          .from(
            STORAGE_BUCKET
          )
          .getPublicUrl(
            filePath
          );


      const newUrl =
        publicData?.publicUrl;


      if (!newUrl) {

        throw new Error(
          "Public URL haikupatikana."
        );

      }


      const {
        data,
        error
      } =
        await supabase
          .from("events")
          .update({

            card_image_url:
              newUrl

          })
          .eq(
            "id",
            id
          )
          .select()
          .single();


      if (error) {
        throw error;
      }


      uploadedPath =
        null;


      res.json({

        success:
          true,

        message:
          `Kadi ya Event ${event.event_key} imebadilishwa.`,

        event:
          data

      });


    } catch (error) {

      if (uploadedPath) {

        await deleteCardFromStorage(
          uploadedPath
        );

      }


      console.error(
        "CHANGE CARD:",
        error.message
      );


      res.status(500).json({

        success:
          false,

        error:
          error.message

      });

    }

  }
);

/* =========================================================
   DISABLE EVENT
========================================================= */

app.delete(
  "/api/events/:id",
  async (req, res) => {

    try {

      const id =
        req.params.id;


      const {
        data: event,
        error: findError
      } =
        await supabase
          .from("events")
          .select(
            "id,event_key"
          )
          .eq(
            "id",
            id
          )
          .maybeSingle();


      if (findError) {
        throw findError;
      }


      if (!event) {

        return res.status(404).json({

          success:
            false,

          message:
            "Event haikupatikana."

        });

      }


      const {
        data,
        error
      } =
        await supabase
          .from("events")
          .update({

            is_active:
              false

          })
          .eq(
            "id",
            id
          )
          .select()
          .single();


      if (error) {
        throw error;
      }


      res.json({

        success:
          true,

        message:
          `Event ${event.event_key} imezimwa.`,

        event:
          data

      });


    } catch (error) {

      res.status(500).json({

        success:
          false,

        error:
          error.message

      });

    }

  }
);

/* =========================================================
   CREATE QR IMAGE
========================================================= */

async function createQRImage(
  qrToken
) {

  return QRCode.toBuffer(
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

}

/* =========================================================
   CREATE PERSONAL CARD
========================================================= */

async function createCardWithQR(
  qrToken,
  cardImageUrl,
  eventKey
) {

  if (!cardImageUrl) {

    throw new Error(
      `Event ${eventKey} haina Kadi.`
    );

  }


  const response =
    await axios.get(
      cardImageUrl,
      {

        responseType:
          "arraybuffer",

        timeout:
          30000

      }
    );


  if (!response.data) {

    throw new Error(
      `Kadi ya Event ${eventKey} haikupatikana.`
    );

  }


  const originalImage =
    Buffer.from(
      response.data
    );


  const qrImage =
    await createQRImage(
      qrToken
    );


  const metadata =
    await sharp(
      originalImage
    ).metadata();


  const imageWidth =
    metadata.width ||
    1024;


  const imageHeight =
    metadata.height ||
    1536;


  const scaleX =
    imageWidth /
    1024;


  const scaleY =
    imageHeight /
    1536;


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
          fit:
            "contain"
        }
      )
      .png()
      .toBuffer();


  const card =
    await sharp(
      originalImage
    )
      .composite([{

        input:
          resizedQR,

        left:
          finalX,

        top:
          finalY

      }])
      .png()
      .toBuffer();


  return card;

}

/* =========================================================
   UPLOAD PERSONAL CARD
========================================================= */

async function uploadCardToStorage(
  cardBuffer,
  name,
  code,
  eventKey,
  qrToken
) {

  const safeEvent =
    safeFileName(
      eventKey
    );

  const safeName =
    safeFileName(
      name
    );

  const safeCode =
    safeFileName(
      code
    );


  const filePath =
    `${safeEvent}/${safeCode}-${safeName}-${qrToken}.png`;


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


  if (!data?.publicUrl) {

    throw new Error(
      "Public URL ya personal card haikupatikana."
    );

  }


  return {

    filePath:
      filePath,

    publicUrl:
      data.publicUrl

  };

}

/* =========================================================
   FIND GUEST
   EVENT + CODE
========================================================= */

async function findExistingGuest(
  eventKey,
  code
) {

  const cleanEvent =
    normalizeEvent(
      eventKey
    );

  const cleanCode =
    normalizeCode(
      code
    );


  if (!cleanCode) {
    return null;
  }


  const {
    data,
    error
  } =
    await supabase
      .from("guests")
      .select(
        "id,full_name,phone,guest_code,event_key,qr_token,card_image_url,invitation_type,attendance_status,scanned_at,created_at"
      )
      .eq(
        "event_key",
        cleanEvent
      )
      .eq(
        "guest_code",
        cleanCode
      )
      .limit(1)
      .maybeSingle();


  if (error) {
    throw error;
  }


  return data || null;

}

/* =========================================================
   PREPARE PERSONAL CARD
========================================================= */

async function preparePersonalCard(
  name,
  code,
  eventKey
) {

  const cleanEvent =
    normalizeEvent(
      eventKey
    );


  const eventConfig =
    await getEventConfig(
      cleanEvent
    );


  const qrToken =
    createQRToken();


  const cardBuffer =
    await createCardWithQR(
      qrToken,
      eventConfig.card_image_url,
      cleanEvent
    );


  const storage =
    await uploadCardToStorage(
      cardBuffer,
      name,
      code,
      cleanEvent,
      qrToken
    );


  return {

    qrToken:
      qrToken,

    cardImageUrl:
      storage.publicUrl,

    storagePath:
      storage.filePath,

    eventKey:
      cleanEvent,

    eventName:
      eventConfig.event_name,

    eventCardUrl:
      eventConfig.card_image_url,

    templateName:
      eventConfig.template_name ||
      TEMPLATE_NAME,

    templateLanguage:
      eventConfig.template_language ||
      TEMPLATE_LANGUAGE

  };

}

/* =========================================================
   SAVE GUEST
========================================================= */

async function saveGuest(
  to,
  name,
  code,
  eventKey,
  qrToken,
  cardImageUrl
) {

  const phone =
    normalizePhone(
      to
    );

  const cleanEvent =
    normalizeEvent(
      eventKey
    );

  const cleanCode =
    normalizeCode(
      code
    );


  if (!phone) {

    throw new Error(
      "Namba ya simu si sahihi."
    );

  }


  if (!name) {

    throw new Error(
      "Jina la mgeni linahitajika."
    );

  }


  if (!cleanCode) {

    throw new Error(
      "Code ya mgeni inahitajika."
    );

  }


  if (!qrToken) {

    throw new Error(
      "QR Token haipo."
    );

  }


  if (!cardImageUrl) {

    throw new Error(
      `Kadi ya Event ${cleanEvent} haipo.`
    );

  }


  const payload = {

    full_name:
      name,

    phone:
      phone,

    guest_code:
      cleanCode,

    event_key:
      cleanEvent,

    qr_token:
      qrToken,

    card_image_url:
      cardImageUrl,

    invitation_type:
      getInvitationType(
        cleanCode
      ),

    attendance_status:
      "pending"

  };


  const {
    data,
    error
  } =
    await supabase
      .from("guests")
      .insert([
        payload
      ])
      .select()
      .single();


  if (error) {

    if (
      error.code ===
      "23505"
    ) {

      const existing =
        await findExistingGuest(
          cleanEvent,
          cleanCode
        );


      const duplicate =
        new Error(
          `Code ${cleanCode} tayari ipo kwenye event ${cleanEvent}.`
        );


      duplicate.code =
        "GUEST_EVENT_CODE_DUPLICATE";


      duplicate.existingGuest =
        existing;


      throw duplicate;

    }


    throw error;

  }


  return data;

}

/* =========================================================
   SEND TEXT
========================================================= */

async function sendText(
  to,
  text
) {

  if (
    !WHATSAPP_TOKEN ||
    !PHONE_NUMBER_ID
  ) {

    throw new Error(
      "WHATSAPP_TOKEN au PHONE_NUMBER_ID haipo."
    );

  }


  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;


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


  return response.data;

}

/* =========================================================
   SEND INVITATION TEMPLATE
========================================================= */

async function sendInvitation(
  to,
  name,
  code,
  cardImageUrl,
  templateName,
  templateLanguage,
  eventKey
) {

  const cleanEvent =
    normalizeEvent(
      eventKey
    );


  if (!cardImageUrl) {

    throw new Error(
      `Card ya Event ${cleanEvent} haipo.`
    );

  }


  const finalTemplateName =
    templateName ||
    TEMPLATE_NAME;


  const finalLanguage =
    templateLanguage ||
    TEMPLATE_LANGUAGE;


  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;


  const components = [

    {

      type:
        "header",

      parameters: [

        {

          type:
            "image",

          image: {

            link:
              cardImageUrl

          }

        }

      ]

    },

    {

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

    }

  ];


  console.log(
    "WhatsApp SEND:",
    {
      to:
        normalizePhone(to),
      event:
        cleanEvent,
      template:
        finalTemplateName
    }
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
            finalTemplateName,

          language: {

            code:
              finalLanguage

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


  return response.data;

}

/* =========================================================
   SINGLE INVITATION
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
      } =
        req.body || {};


      if (
        !to ||
        !name ||
        !code ||
        !event_key
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "to, name, code na event_key vinahitajika."

        });

      }


      const cleanEvent =
        normalizeEvent(
          event_key
        );

      const cleanCode =
        normalizeCode(
          code
        );

      const cleanName =
        String(
          name
        ).trim();


      const eventConfig =
        await getEventConfig(
          cleanEvent
        );


      const existing =
        await findExistingGuest(
          cleanEvent,
          cleanCode
        );


      if (existing) {

        return res.status(409).json({

          success:
            false,

          duplicate:
            true,

          message:
            `Code ${cleanCode} tayari ipo kwenye event ${cleanEvent}.`,

          event_key:
            cleanEvent,

          guest:
            existing

        });

      }


      preparedCard =
        await preparePersonalCard(
          cleanName,
          cleanCode,
          cleanEvent
        );


      /*
        SECURITY
      */

      if (
        preparedCard.eventKey !==
        cleanEvent
      ) {

        throw new Error(
          "Security error: Event mismatch."
        );

      }


      if (
        preparedCard.eventCardUrl !==
        eventConfig.card_image_url
      ) {

        throw new Error(
          "Security error: Card mismatch."
        );

      }


      const whatsappResult =
        await sendInvitation(
          to,
          cleanName,
          cleanCode,
          preparedCard.cardImageUrl,
          preparedCard.templateName,
          preparedCard.templateLanguage,
          cleanEvent
        );


      const guest =
        await saveGuest(
          to,
          cleanName,
          cleanCode,
          cleanEvent,
          preparedCard.qrToken,
          preparedCard.cardImageUrl
        );


      res.json({

        success:
          true,

        event_key:
          cleanEvent,

        event_name:
          preparedCard.eventName,

        card_image_url:
          preparedCard.cardImageUrl,

        guest:
          guest,

        result:
          whatsappResult

      });


    } catch (error) {

      if (
        preparedCard?.storagePath
      ) {

        await deleteCardFromStorage(
          preparedCard.storagePath
        );

      }


      if (
        error.code ===
        "GUEST_EVENT_CODE_DUPLICATE"
      ) {

        return res.status(409).json({

          success:
            false,

          duplicate:
            true,

          message:
            error.message,

          guest:
            error.existingGuest ||
            null

        });

      }


      console.error(
        "SEND INVITATION:",
        error.response?.data ||
        error.message
      );


      res.status(500).json({

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

      const {
        contacts,
        event_key
      } =
        req.body || {};


      if (
        !Array.isArray(
          contacts
        )
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "contacts lazima iwe array."

        });

      }


      if (!contacts.length) {

        return res.status(400).json({

          success:
            false,

          message:
            "Hakuna contact."

        });

      }


      if (!event_key) {

        return res.status(400).json({

          success:
            false,

          message:
            "Event Key inahitajika kwa Bulk Send."

        });

      }


      const requestEvent =
        normalizeEvent(
          event_key
        );


      const eventConfig =
        await getEventConfig(
          requestEvent
        );


      const results = [];


      console.log(
        "=============================================="
      );

      console.log(
        "BULK SEND"
      );

      console.log(
        "EVENT:",
        requestEvent
      );

      console.log(
        "TOTAL:",
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
          contacts[i] || {};


        const to =
          String(
            contact.to ||
            ""
          ).trim();


        const name =
          String(
            contact.name ||
            ""
          ).trim();


        const code =
          normalizeCode(
            contact.code ||
            ""
          );


        /*
          Frontend yetu inatuma Event Key
          kwa kila contact.

          Kama imebadilishwa manually,
          tunakataa.
        */

        if (
          contact.event_key
        ) {

          let contactEvent;

          try {

            contactEvent =
              normalizeEvent(
                contact.event_key
              );

          } catch (error) {

            results.push({

              to:
                to,

              name:
                name,

              code:
                code,

              event_key:
                contact.event_key,

              success:
                false,

              event_mismatch:
                true,

              error:
                error.message

            });

            continue;

          }


          if (
            contactEvent !==
            requestEvent
          ) {

            results.push({

              to:
                to,

              name:
                name,

              code:
                code,

              event_key:
                contactEvent,

              success:
                false,

              event_mismatch:
                true,

              error:
                `Event mismatch. Bulk hii ni ${requestEvent}, contact ana ${contactEvent}.`

            });

            continue;

          }

        }


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
              requestEvent,

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

          /*
            DUPLICATE
          */

          const existing =
            await findExistingGuest(
              requestEvent,
              code
            );


          if (existing) {

            results.push({

              to:
                to,

              name:
                name,

              code:
                code,

              event_key:
                requestEvent,

              success:
                false,

              duplicate:
                true,

              error:
                `Code ${code} tayari ipo kwenye event ${requestEvent}.`

            });

            continue;

          }


          /*
            CREATE PERSONAL CARD
          */

          preparedCard =
            await preparePersonalCard(
              name,
              code,
              requestEvent
            );


          /*
            SECURITY CHECK
          */

          if (
            preparedCard.eventKey !==
            requestEvent
          ) {

            throw new Error(
              `Prepared Event ${preparedCard.eventKey} si ${requestEvent}.`
            );

          }


          if (
            preparedCard.eventCardUrl !==
            eventConfig.card_image_url
          ) {

            throw new Error(
              "Card mismatch imezuiwa."
            );

          }


          /*
            SEND WHATSAPP
          */

          const whatsappResult =
            await sendInvitation(
              to,
              name,
              code,
              preparedCard.cardImageUrl,
              preparedCard.templateName,
              preparedCard.templateLanguage,
              requestEvent
            );


          /*
            SAVE DATABASE
          */

          const guest =
            await saveGuest(
              to,
              name,
              code,
              requestEvent,
              preparedCard.qrToken,
              preparedCard.cardImageUrl
            );


          results.push({

            to:
              to,

            name:
              name,

            code:
              code,

            event_key:
              requestEvent,

            event_name:
              preparedCard.eventName,

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
            `BULK ${i + 1}/${contacts.length}: SUCCESS`
          );


        } catch (error) {

          if (
            preparedCard?.storagePath
          ) {

            await deleteCardFromStorage(
              preparedCard.storagePath
            );

          }


          const duplicate =
            error.code ===
            "GUEST_EVENT_CODE_DUPLICATE";


          results.push({

            to:
              to,

            name:
              name,

            code:
              code,

            event_key:
              requestEvent,

            success:
              false,

            duplicate:
              duplicate,

            error:
              duplicate
                ? error.message
                : (
                    error.response?.data ||
                    error.message
                  )

          });


          console.error(
            `BULK ${i + 1} ERROR:`,
            error.response?.data ||
            error.message
          );

        }


        /*
          DELAY

          Inasaidia kupunguza
          request zinazofuatana sana.
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


      const duplicates =
        results.filter(
          item =>
            item.duplicate
        ).length;


      const eventMismatches =
        results.filter(
          item =>
            item.event_mismatch
        ).length;


      res.json({

        success:
          true,

        total:
          contacts.length,

        event_key:
          requestEvent,

        event_name:
          eventConfig.event_name,

        card_image_url:
          eventConfig.card_image_url,

        successful:
          successful,

        failed:
          failed,

        duplicates:
          duplicates,

        event_mismatches:
          eventMismatches,

        results:
          results

      });


    } catch (error) {

      console.error(
        "BULK SEND ERROR:",
        error.response?.data ||
        error.message
      );


      res.status(500).json({

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
   FIND GUEST BY PHONE
   USED FOR WHATSAPP REPLIES
========================================================= */

async function findGuestByPhone(
  phone
) {

  const normalizedPhone =
    normalizePhone(
      phone
    );


  const {
    data,
    error
  } =
    await supabase
      .from("guests")
      .select(
        "id,full_name,phone,guest_code,event_key,qr_token,attendance_status,created_at"
      )
      .eq(
        "phone",
        normalizedPhone
      )
      .order(
        "created_at",
        {
          ascending:
            false
        }
      )
      .limit(20);


  if (error) {

    console.error(
      "FIND PHONE:",
      error.message
    );

    return [];

  }


  return data || [];

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
      .from("guests")
      .select(
        "id,full_name,phone,guest_code,event_key,created_at"
      )
      .eq(
        "phone",
        normalizedPhone
      );


  /*
    Kama Event ipo,
    lazima itumike.
  */

  if (eventKey) {

    query =
      query.eq(
        "event_key",
        normalizeEvent(
          eventKey
        )
      );

  }


  const {
    data,
    error
  } =
    await query
      .order(
        "created_at",
        {
          ascending:
            false
        }
      )
      .limit(1);


  if (error) {

    console.error(
      "FIND GUEST:",
      error.message
    );

    return null;

  }


  const guest =
    data?.[0];


  if (!guest) {
    return null;
  }


  const {
    data: updated,
    error: updateError
  } =
    await supabase
      .from("guests")
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


  if (updateError) {

    console.error(
      "UPDATE ATTENDANCE:",
      updateError.message
    );

    return null;

  }


  return updated;

}

/* =========================================================
   PROCESS ATTENDANCE REPLY
========================================================= */

async function processAttendanceReply(
  from,
  buttonId,
  buttonTitle,
  eventKey
) {

  const id =
    String(
      buttonId || ""
    )
      .toLowerCase()
      .trim();


  const title =
    String(
      buttonTitle || ""
    )
      .toLowerCase()
      .trim();


  let status =
    null;


  let replyText =
    "";


  if (
    id === "nitashiriki" ||
    title === "nitashiriki"
  ) {

    status =
      "confirmed";

    replyText =
      "Asante kwa jibu lako. Karibu sana GeitaCard! Tumethibitisha kuwa utashiriki.";

  }


  else if (
    id === "sitashiriki" ||
    title === "sitashiriki"
  ) {

    status =
      "declined";

    replyText =
      "Asante kwa taarifa yako. Tumepokea kuwa hutashiriki. Karibu tena wakati mwingine. GeitaCard.";

  }


  else if (
    id === "sina_uhakika" ||
    id === "sinauhakika" ||
    title === "sina uhakika"
  ) {

    status =
      "maybe";

    replyText =
      "Asante kwa taarifa yako. Tutangoja uthibitisho wako. Karibu sana GeitaCard.";

  }


  if (!status) {

    return false;

  }


  /*
    Kama Event Key haipo kwenye webhook,
    tunatafuta guest kwa phone.

    Kama namba ina guest nyingi kwenye
    Events tofauti, tunatumia guest
    wa mwisho kutuma invitation.
  */

  let guest =
    null;


  if (eventKey) {

    guest =
      await updateAttendance(
        from,
        status,
        eventKey
      );

  } else {

    const candidates =
      await findGuestByPhone(
        from
      );


    if (
      candidates.length
    ) {

      /*
        Latest invitation ndiyo
        tunayotumia kwa reply.
      */

      guest =
        await updateAttendance(
          from,
          status,
          candidates[0].event_key
        );

    }

  }


  if (guest) {

    try {

      await sendText(
        from,
        replyText
      );

    } catch (sendError) {

      console.error(
        "REPLY TEXT ERROR:",
        sendError.response?.data ||
        sendError.message
      );

    }

  }


  return true;

}

/* =========================================================
   WHATSAPP WEBHOOK VERIFICATION
========================================================= */

app.get(
  "/webhook",
  (req, res) => {

    const mode =
      req.query[
        "hub.mode"
      ];

    const token =
      req.query[
        "hub.verify_token"
      ];

    const challenge =
      req.query[
        "hub.challenge"
      ];


    if (
      mode === "subscribe" &&
      token === VERIFY_TOKEN
    ) {

      return res
        .status(200)
        .send(
          challenge
        );

    }


    return res.sendStatus(
      403
    );

  }
);

/* =========================================================
   WHATSAPP WEBHOOK
========================================================= */

app.post(
  "/webhook",
  async (req, res) => {

    /*
      WhatsApp inahitaji response
      haraka.

      Tunajibu 200 mapema baada ya
      kuthibitisha payload.
    */

    try {

      const body =
        req.body;


      if (
        body?.object !==
        "whatsapp_business_account"
      ) {

        return res.sendStatus(
          200
        );

      }


      const entry =
        body.entry?.[0];


      const change =
        entry?.changes?.[0];


      const value =
        change?.value;


      if (!value) {

        return res.sendStatus(
          200
        );

      }


      /*
        STATUS
      */

      if (
        value.statuses?.length
      ) {

        console.log(
          "WhatsApp status:",
          value.statuses[0]
        );

        return res.sendStatus(
          200
        );

      }


      /*
        MESSAGE
      */

      const message =
        value.messages?.[0];


      if (!message) {

        return res.sendStatus(
          200
        );

      }


      const from =
        message.from;


      console.log(
        "WhatsApp message:",
        {
          from:
            from,

          type:
            message.type

        }
      );


      /*
        TEXT
      */

      if (
        message.type ===
        "text"
      ) {

        console.log(
          "Text:",
          message.text?.body ||
          ""
        );

        return res.sendStatus(
          200
        );

      }


      /*
        OLD TEMPLATE BUTTON
      */

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
          null
        );


        return res.sendStatus(
          200
        );

      }


      /*
        INTERACTIVE BUTTON
      */

      if (
        message.type ===
          "interactive" &&
        message.interactive?.type ===
          "button_reply"
      ) {

        const buttonId =
          message
            .interactive
            .button_reply
            ?.id ||
          "";


        const buttonTitle =
          message
            .interactive
            .button_reply
            ?.title ||
          "";


        await processAttendanceReply(
          from,
          buttonId,
          buttonTitle,
          null
        );


        return res.sendStatus(
          200
        );

      }


      return res.sendStatus(
        200
      );


    } catch (error) {

      console.error(
        "WEBHOOK ERROR:",
        error.response?.data ||
        error.message
      );


      /*
        Usijibu 500 kwa WhatsApp webhook.
      */

      return res.sendStatus(
        200
      );

    }

  }
);

/* =========================================================
   ATTENDANCE DASHBOARD
========================================================= */

app.get(
  "/api/attendance",
  async (req, res) => {

    try {

      /*
        Tunatumia VIEW ikiwa ipo.

        Ikiwa attendance_list haipo,
        tunatumia guests moja kwa moja.
      */

      let {
        data,
        error
      } =
        await supabase
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

        console.warn(
          "attendance_list view unavailable:",
          error.message
        );


        const fallback =
          await supabase
            .from(
              "guests"
            )
            .select(
              "id,full_name,phone,guest_code,event_key,qr_token,card_image_url,invitation_type,attendance_status,scanned_at,created_at"
            )
            .order(
              "created_at",
              {
                ascending:
                  false
              }
            );


        if (fallback.error) {

          throw fallback.error;

        }


        data =
          fallback.data || [];

      }


      res.json({

        success:
          true,

        total:
          data?.length ||
          0,

        guests:
          data || []

      });


    } catch (error) {

      console.error(
        "ATTENDANCE:",
        error.message
      );


      res.status(500).json({

        success:
          false,

        error:
          error.message

      });

    }

  }
);

/* =========================================================
   EXPORT ATTENDANCE EXCEL
========================================================= */

app.get(
  "/api/attendance/export",
  async (req, res) => {

    try {

      const {
        data,
        error
      } =
        await supabase
          .from("guests")
          .select(
            "full_name,phone,guest_code,event_key,qr_token,card_image_url,invitation_type,attendance_status,scanned_at,created_at"
          )
          .order(
            "created_at",
            {
              ascending:
                false
            }
          );


      if (error) {
        throw error;
      }


      const rows =
        (data || [])
          .map(
            (guest, index) => ({

              "#":
                index + 1,

              "Jina":
                guest.full_name || "",

              "Simu":
                guest.phone || "",

              "Event":
                guest.event_key || "",

              "Code":
                guest.guest_code || "",

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
        { wch: 22 },
        { wch: 40 },
        { wch: 60 },
        { wch: 15 },
        { wch: 18 },
        { wch: 20 },
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


      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );


      res.setHeader(
        "Content-Disposition",
        'attachment; filename="GeitaCard_Wahudhuriaji.xlsx"'
      );


      res.send(
        buffer
      );


    } catch (error) {

      console.error(
        "EXPORT:",
        error.message
      );


      res.status(500).json({

        success:
          false,

        error:
          error.message

      });

    }

  }
);

/* =========================================================
   MANUAL CODE CHECK-IN
========================================================= */

app.post(
  "/api/check-in",
  async (req, res) => {

    try {

      const {
        code,
        event_key
      } =
        req.body || {};


      if (!code) {

        return res.status(400).json({

          success:
            false,

          message:
            "Code ya mgeni inahitajika."

        });

      }


      if (!event_key) {

        return res.status(400).json({

          success:
            false,

          message:
            "Event Key inahitajika kwa Check-in."

        });

      }


      const cleanCode =
        normalizeCode(
          code
        );


      const cleanEvent =
        normalizeEvent(
          event_key
        );


      const {
        data: guests,
        error
      } =
        await supabase
          .from("guests")
          .select("*")
          .eq(
            "guest_code",
            cleanCode
          )
          .eq(
            "event_key",
            cleanEvent
          )
          .order(
            "created_at",
            {
              ascending:
                false
            }
          )
          .limit(1);


      if (error) {

        return res.status(500).json({

          success:
            false,

          message:
            error.message

        });

      }


      const guest =
        guests?.[0];


      if (!guest) {

        return res.status(404).json({

          success:
            false,

          message:
            `Mgeni mwenye code ${cleanCode} hakupatikana kwenye event ${cleanEvent}.`

        });

      }


      if (
        guest.scanned_at
      ) {

        return res.status(409).json({

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


      const scannedAt =
        new Date().toISOString();


      const {
        data: updatedGuest,
        error: updateError
      } =
        await supabase
          .from("guests")
          .update({

            scanned_at:
              scannedAt

          })
          .eq(
            "id",
            guest.id
          )
          .eq(
            "event_key",
            cleanEvent
          )
          .is(
            "scanned_at",
            null
          )
          .select()
          .single();


      if (updateError) {

        return res.status(500).json({

          success:
            false,

          message:
            updateError.message

        });

      }


      res.json({

        success:
          true,

        message:
          "Mgeni ameingia ukumbini.",

        event_key:
          cleanEvent,

        guest:
          updatedGuest

      });


    } catch (error) {

      console.error(
        "CODE CHECK-IN:",
        error.message
      );


      res.status(500).json({

        success:
          false,

        message:
          error.message

      });

    }

  }
);

/* =========================================================
   QR CHECK-IN
========================================================= */

app.post(
  "/api/check-in-qr",
  async (req, res) => {

    try {

      const {
        qr_token
      } =
        req.body || {};


      if (!qr_token) {

        return res.status(400).json({

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


      const {
        data: guest,
        error
      } =
        await supabase
          .from("guests")
          .select("*")
          .eq(
            "qr_token",
            qrToken
          )
          .maybeSingle();


      if (error) {

        return res.status(500).json({

          success:
            false,

          message:
            error.message

        });

      }


      if (!guest) {

        return res.status(404).json({

          success:
            false,

          message:
            "QR Code hii si ya mgeni aliyesajiliwa."

        });

      }


      if (
        guest.scanned_at
      ) {

        return res.status(409).json({

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
          .from("guests")
          .update({

            scanned_at:
              new Date().toISOString()

          })
          .eq(
            "id",
            guest.id
          )
          .eq(
            "qr_token",
            qrToken
          )
          .is(
            "scanned_at",
            null
          )
          .select()
          .single();


      if (updateError) {

        return res.status(500).json({

          success:
            false,

          message:
            updateError.message

        });

      }


      res.json({

        success:
          true,

        message:
          "QR Check-in imefanikiwa.",

        event_key:
          updatedGuest.event_key,

        guest:
          updatedGuest

      });


    } catch (error) {

      console.error(
        "QR CHECK-IN:",
        error.message
      );


      res.status(500).json({

        success:
          false,

        message:
          error.message

      });

    }

  }
);

/* =========================================================
   404 API
========================================================= */

app.use(
  "/api",
  (req, res) => {

    res.status(404).json({

      success:
        false,

      error:
        "API endpoint haipo."

    });

  }
);

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (error, req, res, next) => {

    console.error(
      "GLOBAL ERROR:",
      error
    );


    if (
      res.headersSent
    ) {

      return next(
        error
      );

    }


    res.status(500).json({

      success:
        false,

      error:
        error.message ||
        "Server error."

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
      `GeitaCard server running on port ${PORT}`
    );

    console.log(
      "Dashboard:",
      `http://localhost:${PORT}/`
    );

    console.log(
      "Health:",
      `http://localhost:${PORT}/health`
    );

    console.log(
      "Event System: ENABLED"
    );

    console.log(
      "Card A/B Separation: ENABLED"
    );

    console.log(
      "Excel/CSV: ENABLED"
    );

    console.log(
      "Bulk WhatsApp: ENABLED"
    );

    console.log(
      "Manual Check-in: ENABLED"
    );

    console.log(
      "QR Check-in: ENABLED"
    );

    console.log(
      "Dashboard: ENABLED"
    );

    console.log(
      "Default Event: DISABLED"
    );

    console.log(
      "=============================================="
    );

  }
);
