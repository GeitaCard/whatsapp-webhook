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
   CONFIG
========================================================= */

const PORT = Number(process.env.PORT || 10000);

const SUPABASE_URL =
  process.env.SUPABASE_URL || "";

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const WHATSAPP_TOKEN =
  process.env.WHATSAPP_TOKEN || "";

const PHONE_NUMBER_ID =
  process.env.PHONE_NUMBER_ID || "";

const VERIFY_TOKEN =
  process.env.VERIFY_TOKEN || "";

const GRAPH_VERSION =
  process.env.GRAPH_VERSION || "v26.0";

const DEFAULT_TEMPLATE =
  process.env.TEMPLATE_NAME ||
  "geitacard_invitation";

const DEFAULT_LANGUAGE =
  process.env.TEMPLATE_LANGUAGE ||
  "sw";

const STORAGE_BUCKET =
  process.env.STORAGE_BUCKET ||
  "guest-cards";

/*
   QR position kwenye kadi ya 1024 x 1536.
*/
const QR_X =
  Number(process.env.QR_X || 495);

const QR_Y =
  Number(process.env.QR_Y || 1185);

const QR_SIZE =
  Number(process.env.QR_SIZE || 175);

const BULK_DELAY_MS =
  Number(process.env.BULK_DELAY_MS || 1000);

/* =========================================================
   SUPABASE
========================================================= */

if (
  !SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY
) {
  console.error(
    "❌ SUPABASE_URL au SUPABASE_SERVICE_ROLE_KEY haipo."
  );
}

const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  );

/* =========================================================
   EXPRESS
========================================================= */

app.use(
  express.json({
    limit: "30mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "30mb"
  })
);

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
  )
);

/* =========================================================
   GENERAL HELPERS
========================================================= */

function normalizeEvent(value) {

  const key =
    String(value || "")
      .trim()
      .toUpperCase();

  if (!key) {
    throw new Error(
      "Event Key inahitajika."
    );
  }

  if (
    !/^[A-Z0-9_-]+$/.test(key)
  ) {
    throw new Error(
      "Event Key inaweza kuwa na A-Z, 0-9, _ na - tu."
    );
  }

  return key;
}

function normalizePhone(value) {

  let result =
    String(value || "")
      .trim()
      .replace(/\D/g, "");

  /*
     Tanzania:
     0712345678 -> 255712345678
  */
  if (
    result.startsWith("0") &&
    result.length === 10
  ) {
    result =
      "255" +
      result.substring(1);
  }

  return result;
}

function normalizeCode(value) {

  return String(
    value || ""
  ).trim();
}

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

function wait(ms) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}

function createQRToken() {

  return crypto.randomUUID();
}

function getInvitationType(code) {

  const value =
    normalizeCode(code)
      .toUpperCase();

  if (
    value.endsWith("-KAMATI")
  ) {
    return "KAMATI";
  }

  if (
    value.endsWith("-SINGLE")
  ) {
    return "SINGLE";
  }

  return "UNKNOWN";
}

/* =========================================================
   BASE64 IMAGE
========================================================= */

function parseBase64Image(value) {

  const text =
    String(
      value || ""
    ).trim();

  if (!text) {
    throw new Error(
      "Picha ya Kadi haikutumwa."
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

  if (!buffer.length) {
    throw new Error(
      "Picha ya Kadi ni tupu au imeharibika."
    );
  }

  return {
    buffer,
    mime
  };
}

/* =========================================================
   STORAGE UPLOAD
========================================================= */

async function uploadToStorage(
  buffer,
  contentType,
  filePath
) {

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
        buffer,
        {
          contentType,
          upsert: false
        }
      );

  if (error) {
    throw new Error(
      "Storage upload error: " +
      error.message
    );
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

  if (
    !data ||
    !data.publicUrl
  ) {
    throw new Error(
      "Public URL ya Kadi haikupatikana."
    );
  }

  return {
    path:
      filePath,
    url:
      data.publicUrl
  };
}

/* =========================================================
   STORAGE DELETE
========================================================= */

async function deleteFromStorage(
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
        "Storage delete:",
        error.message
      );
    }

  } catch (error) {

    console.error(
      "Storage delete exception:",
      error.message
    );
  }
}

/* =========================================================
   GET EVENT CONFIG
========================================================= */

async function getEventConfig(
  value
) {

  const key =
    normalizeEvent(value);

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
        key
      )
      .eq(
        "is_active",
        true
      )
      .maybeSingle();

  if (error) {

    throw new Error(
      "Event database error: " +
      error.message
    );
  }

  if (!data) {

    throw new Error(
      `Event "${key}" haipo au haijawekwa active.`
    );
  }

  if (
    !data.card_image_url
  ) {

    throw new Error(
      `Event "${key}" haina Kadi iliyowekwa.`
    );
  }

  /*
     SECURITY:
     Event iliyopatikana lazima iwe
     ile ile iliyoombwa.
  */
  if (
    String(
      data.event_key || ""
    )
      .trim()
      .toUpperCase() !==
    key
  ) {

    throw new Error(
      "Event/Card mismatch imezuiwa."
    );
  }

  return data;
}

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

    res.json({

      success:
        true,

      service:
        "GeitaCard",

      event_system:
        "enabled",

      event_card_separation:
        "enabled",

      excel_csv:
        "enabled",

      bulk_whatsapp:
        "enabled",

      qr:
        "enabled",

      code_checkin:
        "enabled",

      qr_checkin:
        "enabled",

      dashboard:
        "enabled",

      storage_bucket:
        STORAGE_BUCKET
    });
  }
);

/* =========================================================
   EVENTS - LIST
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
   CREATE EVENT + KADI
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

      const key =
        normalizeEvent(
          event_key
        );

      if (
        !card_image_base64
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "Tafadhali upload Kadi ya Event."

        });
      }

      /*
         Check duplicate Event.
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
            key
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
            `Event ${key} tayari ipo.`,

          event:
            existing

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
        /jpeg|jpg/i.test(mime)
      ) {
        extension =
          "jpg";
      }

      if (
        /webp/i.test(mime)
      ) {
        extension =
          "webp";
      }

      const originalName =
        safeFileName(
          card_image_name ||
          `${key}.${extension}`
        );

      const filePath =
        `events/${safeFileName(key)}/${Date.now()}-${originalName}.${extension}`;

      const uploaded =
        await uploadToStorage(
          buffer,
          mime,
          filePath
        );

      uploadedPath =
        uploaded.path;

      const {
        data,
        error
      } =
        await supabase
          .from("events")
          .insert([{

            event_key:
              key,

            event_name:
              String(
                event_name ||
                key
              ).trim(),

            card_image_url:
              uploaded.url,

            template_name:
              String(
                template_name ||
                DEFAULT_TEMPLATE
              ).trim(),

            template_language:
              String(
                template_language ||
                DEFAULT_LANGUAGE
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
          `Event ${key} imeundwa na Kadi imehifadhiwa.`,

        event:
          data

      });

    } catch (error) {

      if (uploadedPath) {

        await deleteFromStorage(
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
   CHANGE EVENT CARD
========================================================= */

app.post(
  "/api/events/:id/card",
  async (req, res) => {

    let uploadedPath =
      null;

    try {

      const {
        card_image_base64,
        card_image_name
      } =
        req.body || {};

      if (
        !card_image_base64
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "Tafadhali upload Kadi mpya."

        });
      }

      const {
        data: event,
        error: eventError
      } =
        await supabase
          .from("events")
          .select(
            "id,event_key,event_name,card_image_url,template_name,template_language,is_active"
          )
          .eq(
            "id",
            req.params.id
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
        /jpeg|jpg/i.test(mime)
      ) {
        extension =
          "jpg";
      }

      if (
        /webp/i.test(mime)
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
        `events/${safeFileName(event.event_key)}/${Date.now()}-${originalName}.${extension}`;

      const uploaded =
        await uploadToStorage(
          buffer,
          mime,
          filePath
        );

      uploadedPath =
        uploaded.path;

      const {
        data,
        error
      } =
        await supabase
          .from("events")
          .update({

            card_image_url:
              uploaded.url

          })
          .eq(
            "id",
            event.id
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

        await deleteFromStorage(
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

      const {
        data: event,
        error
      } =
        await supabase
          .from("events")
          .select(
            "id,event_key"
          )
          .eq(
            "id",
            req.params.id
          )
          .maybeSingle();

      if (error) {
        throw error;
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
        error: updateError
      } =
        await supabase
          .from("events")
          .update({

            is_active:
              false

          })
          .eq(
            "id",
            event.id
          )
          .select()
          .single();

      if (updateError) {
        throw updateError;
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

      console.error(
        "DISABLE EVENT:",
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
   CREATE PERSONAL CARD WITH QR
========================================================= */

async function createPersonalCard(
  name,
  guestCode,
  eventConfig
) {

  /*
     KADI INATOKA KWENYE EVENT ILIYOCHAGULIWA.

     EVENT_A -> CARD A
     EVENT_B -> CARD B
  */

  const response =
    await axios.get(
      eventConfig.card_image_url,
      {
        responseType:
          "arraybuffer",

        timeout:
          30000
      }
    );

  if (!response.data) {

    throw new Error(
      `Kadi ya Event ${eventConfig.event_key} haikupatikana.`
    );
  }

  const original =
    Buffer.from(
      response.data
    );

  const metadata =
    await sharp(
      original
    ).metadata();

  const width =
    Number(
      metadata.width ||
      1024
    );

  const height =
    Number(
      metadata.height ||
      1536
    );

  const token =
    createQRToken();

  const qr =
    await QRCode.toBuffer(
      token,
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

  const scaleX =
    width /
    1024;

  const scaleY =
    height /
    1536;

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

  const resizedQR =
    await sharp(qr)
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

  const finalCard =
    await sharp(original)
      .composite([{

        input:
          resizedQR,

        left:
          Math.min(
            finalX,
            Math.max(
              0,
              width -
              finalSize
            )
          ),

        top:
          Math.min(
            finalY,
            Math.max(
              0,
              height -
              finalSize
            )
          )

      }])
      .png()
      .toBuffer();

  const filePath =
    `${safeFileName(eventConfig.event_key)}/${safeFileName(guestCode)}-${safeFileName(name)}-${token}.png`;

  const uploaded =
    await uploadToStorage(
      finalCard,
      "image/png",
      filePath
    );

  return {

    qrToken:
      token,

    cardImageUrl:
      uploaded.url,

    storagePath:
      uploaded.path,

    eventKey:
      eventConfig.event_key,

    eventName:
      eventConfig.event_name,

    eventCardUrl:
      eventConfig.card_image_url,

    templateName:
      eventConfig.template_name ||
      DEFAULT_TEMPLATE,

    templateLanguage:
      eventConfig.template_language ||
      DEFAULT_LANGUAGE

  };
}

/* =========================================================
   FIND GUEST
   EVENT + CODE
========================================================= */

async function findExistingGuest(
  eventKey,
  guestCode
) {

  const key =
    normalizeEvent(
      eventKey
    );

  const cleanCode =
    normalizeCode(
      guestCode
    );

  const {
    data,
    error
  } =
    await supabase
      .from("guests")
      .select("*")
      .eq(
        "event_key",
        key
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
   SAVE GUEST
========================================================= */

async function saveGuest({
  to,
  name,
  guestCode,
  eventKey,
  qrToken,
  cardImageUrl
}) {

  const payload = {

    full_name:
      String(name).trim(),

    phone:
      normalizePhone(to),

    guest_code:
      normalizeCode(guestCode),

    event_key:
      normalizeEvent(eventKey),

    qr_token:
      qrToken,

    card_image_url:
      cardImageUrl,

    invitation_type:
      getInvitationType(
        guestCode
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
          eventKey,
          guestCode
        );

      const duplicate =
        new Error(
          `Code ${guestCode} tayari ipo kwenye Event ${eventKey}.`
        );

      duplicate.isDuplicate =
        true;

      duplicate.guest =
        existing;

      throw duplicate;
    }

    throw error;
  }

  return data;
}

/* =========================================================
   WHATSAPP SEND TEMPLATE
========================================================= */

async function sendInvitationTemplate({
  to,
  name,
  guestCode,
  cardImageUrl,
  templateName,
  templateLanguage
}) {

  if (
    !WHATSAPP_TOKEN ||
    !PHONE_NUMBER_ID
  ) {

    throw new Error(
      "WHATSAPP_TOKEN au PHONE_NUMBER_ID haijawekwa."
    );
  }

  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const body = {

    messaging_product:
      "whatsapp",

    recipient_type:
      "individual",

    to:
      normalizePhone(to),

    type:
      "template",

    template: {

      name:
        templateName ||
        DEFAULT_TEMPLATE,

      language: {

        code:
          templateLanguage ||
          DEFAULT_LANGUAGE

      },

      components: [

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
                String(name)

            },

            {

              type:
                "text",

              text:
                String(guestCode)

            }

          ]

        }

      ]

    }

  };

  const response =
    await axios.post(
      url,
      body,
      {
        headers: {

          Authorization:
            `Bearer ${WHATSAPP_TOKEN}`,

          "Content-Type":
            "application/json"

        },

        timeout:
          30000
      }
    );

  return response.data;
}

/* =========================================================
   SINGLE SEND
========================================================= */

app.post(
  "/send-invitation",
  async (req, res) => {

    let prepared =
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

      const key =
        normalizeEvent(
          event_key
        );

      const guestCode =
        normalizeCode(
          code
        );

      const event =
        await getEventConfig(
          key
        );

      const existing =
        await findExistingGuest(
          key,
          guestCode
        );

      if (existing) {

        return res.status(409).json({

          success:
            false,

          duplicate:
            true,

          message:
            `Code ${guestCode} tayari ipo kwenye Event ${key}.`,

          guest:
            existing

        });
      }

      prepared =
        await createPersonalCard(
          name,
          guestCode,
          event
        );

      /*
         SECURITY CHECK
      */
      if (
        prepared.eventKey !== key ||
        prepared.eventCardUrl !==
          event.card_image_url
      ) {

        throw new Error(
          "Event/Card mismatch imezuiwa."
        );
      }

      const whatsapp =
        await sendInvitationTemplate({

          to,

          name:
            String(name).trim(),

          guestCode,

          cardImageUrl:
            prepared.cardImageUrl,

          templateName:
            prepared.templateName,

          templateLanguage:
            prepared.templateLanguage

        });

      const guest =
        await saveGuest({

          to,

          name,

          guestCode,

          eventKey:
            key,

          qrToken:
            prepared.qrToken,

          cardImageUrl:
            prepared.cardImageUrl

        });

      res.json({

        success:
          true,

        event_key:
          key,

        event_name:
          event.event_name,

        card_image_url:
          prepared.cardImageUrl,

        guest,

        result:
          whatsapp

      });

    } catch (error) {

      if (
        prepared?.storagePath
      ) {

        await deleteFromStorage(
          prepared.storagePath
        );
      }

      console.error(
        "SEND INVITATION:",
        error.response?.data ||
        error.message
      );

      res.status(
        error.isDuplicate
          ? 409
          : 500
      ).json({

        success:
          false,

        duplicate:
          Boolean(
            error.isDuplicate
          ),

        error:
          error.response?.data ||
          error.message,

        message:
          error.message,

        guest:
          error.guest ||
          null

      });
    }
  }
);

/* =========================================================
   BULK SEND
   EVENT INACHAGULIWA DASHBOARD
   EXCEL HAINA EVENT COLUMN
========================================================= */

app.post(
  "/send-bulk",
  async (req, res) => {

    try {

      const {
        event_key,
        contacts
      } =
        req.body || {};

      /*
         Event moja iliyochaguliwa
         kwenye Dashboard.
      */
      if (!event_key) {

        return res.status(400).json({

          success:
            false,

          message:
            "Chagua Event kwanza."

        });
      }

      if (
        !Array.isArray(contacts) ||
        contacts.length === 0
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "Hakuna wageni wa kutuma."

        });
      }

      const key =
        normalizeEvent(
          event_key
        );

      /*
         Pata Kadi ya Event iliyochaguliwa.
      */
      const event =
        await getEventConfig(
          key
        );

      const results = [];

      /*
         Excel inakuwa:
         Namba | Jina | Code

         Hakuna Event column.
      */
      for (
        let i = 0;
        i < contacts.length;
        i++
      ) {

        const contact =
          contacts[i] || {};

        const to =
          String(
            contact.to || ""
          ).trim();

        const name =
          String(
            contact.name || ""
          ).trim();

        const guestCode =
          normalizeCode(
            contact.code || ""
          );

        let prepared =
          null;

        try {

          if (
            !normalizePhone(to) ||
            !name ||
            !guestCode
          ) {

            results.push({

              to,

              name,

              code:
                guestCode,

              event_key:
                key,

              success:
                false,

              error:
                "Namba, Jina na Code vinahitajika."

            });

            continue;
          }

          /*
             IMPORTANT:

             Duplicate inatafutwa kwa:
             EVENT + CODE

             Hivyo code moja inaweza kuwepo
             Event A na Event B bila kuchanganya.
          */
          const existing =
            await findExistingGuest(
              key,
              guestCode
            );

          if (existing) {

            results.push({

              to,

              name,

              code:
                guestCode,

              event_key:
                key,

              success:
                false,

              duplicate:
                true,

              error:
                `Code ${guestCode} tayari ipo kwenye Event ${key}.`

            });

            continue;
          }

          /*
             Tengeneza Kadi kutoka Event
             iliyochaguliwa.
          */
          prepared =
            await createPersonalCard(
              name,
              guestCode,
              event
            );

          /*
             SECURITY:
             Hakikisha Kadi ni ya Event hiyo.
          */
          if (
            prepared.eventKey !== key ||
            prepared.eventCardUrl !==
              event.card_image_url
          ) {

            throw new Error(
              "Event/Card mismatch imezuiwa."
            );
          }

          /*
             Tuma WhatsApp.
          */
          const whatsapp =
            await sendInvitationTemplate({

              to,

              name,

              guestCode,

              cardImageUrl:
                prepared.cardImageUrl,

              templateName:
                prepared.templateName,

              templateLanguage:
                prepared.templateLanguage

            });

          /*
             Save database baada ya
             WhatsApp kufanikiwa.
          */
          const guest =
            await saveGuest({

              to,

              name,

              guestCode,

              eventKey:
                key,

              qrToken:
                prepared.qrToken,

              cardImageUrl:
                prepared.cardImageUrl

            });

          results.push({

            to,

            name,

            code:
              guestCode,

            event_key:
              key,

            event_name:
              event.event_name,

            success:
              true,

            qr_token:
              prepared.qrToken,

            card_image_url:
              prepared.cardImageUrl,

            guest,

            result:
              whatsapp

          });

          /*
             Delay kidogo kati ya messages.
          */
          if (
            i <
            contacts.length - 1
          ) {

            await wait(
              BULK_DELAY_MS
            );
          }

        } catch (error) {

          if (
            prepared?.storagePath
          ) {

            await deleteFromStorage(
              prepared.storagePath
            );
          }

          results.push({

            to,

            name,

            code:
              guestCode,

            event_key:
              key,

            success:
              false,

            duplicate:
              Boolean(
                error.isDuplicate
              ),

            error:
              error.response?.data ||
              error.message

          });
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

      res.json({

        success:
          true,

        total:
          contacts.length,

        event_key:
          key,

        event_name:
          event.event_name,

        card_image_url:
          event.card_image_url,

        successful,

        failed,

        duplicates,

        results

      });

    } catch (error) {

      console.error(
        "BULK SEND:",
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
   UPDATE ATTENDANCE
========================================================= */

async function updateAttendance(
  from,
  status
) {

  const cleanPhone =
    normalizePhone(from);

  const {
    data,
    error
  } =
    await supabase
      .from("guests")
      .select(
        "id,full_name,phone,guest_code,event_key,created_at"
      )
      .eq(
        "phone",
        cleanPhone
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
    throw error;
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
    throw updateError;
  }

  return updated;
}

/* =========================================================
   ATTENDANCE BUTTON
========================================================= */

async function processAttendanceReply(
  from,
  buttonId,
  buttonTitle
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

  if (
    id === "nitashiriki" ||
    title === "nitashiriki"
  ) {

    status =
      "confirmed";
  }

  else if (
    id === "sitashiriki" ||
    title === "sitashiriki"
  ) {

    status =
      "declined";
  }

  else if (
    id === "sina_uhakika" ||
    id === "sinauhakika" ||
    title === "sina uhakika"
  ) {

    status =
      "maybe";
  }

  if (!status) {
    return false;
  }

  const guest =
    await updateAttendance(
      from,
      status
    );

  if (!guest) {
    return true;
  }

  let message =
    "Asante. Tumepokea jibu lako.";

  if (
    status ===
    "confirmed"
  ) {

    message =
      `Asante ${guest.full_name}. Tumethibitisha kuwa utashiriki. Karibu sana GeitaCard!`;
  }

  if (
    status ===
    "declined"
  ) {

    message =
      "Asante kwa taarifa yako. Tumepokea kuwa hutashiriki.";
  }

  if (
    status ===
    "maybe"
  ) {

    message =
      "Asante. Tumepokea kuwa bado huna uhakika.";
  }

  await sendText(
    from,
    message
  );

  return true;
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
    return null;
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
          normalizePhone(to),

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

        },

        timeout:
          30000

      }

    );

  return response.data;
}

/* =========================================================
   WEBHOOK VERIFY
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
        .send(challenge);
    }

    return res.sendStatus(
      403
    );
  }
);

/* =========================================================
   WEBHOOK RECEIVE
========================================================= */

app.post(
  "/webhook",
  async (req, res) => {

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

      const value =
        body
          ?.entry?.[0]
          ?.changes?.[0]
          ?.value;

      if (!value) {

        return res.sendStatus(
          200
        );
      }

      /*
         Delivery/read statuses.
      */
      if (
        value.statuses?.length
      ) {

        return res.sendStatus(
          200
        );
      }

      const message =
        value.messages?.[0];

      if (!message) {

        return res.sendStatus(
          200
        );
      }

      const from =
        message.from;

      /*
         Old template buttons.
      */
      if (
        message.type ===
        "button"
      ) {

        await processAttendanceReply(

          from,

          message
            .button
            ?.payload,

          message
            .button
            ?.text

        );

        return res.sendStatus(
          200
        );
      }

      /*
         Interactive buttons.
      */
      if (
        message.type ===
          "interactive" &&
        message.interactive
          ?.type ===
          "button_reply"
      ) {

        await processAttendanceReply(

          from,

          message
            .interactive
            .button_reply
            ?.id,

          message
            .interactive
            .button_reply
            ?.title

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
        "WEBHOOK:",
        error.response?.data ||
        error.message
      );

      /*
         WhatsApp ipate 200
         kuzuia retry nyingi.
      */
      return res.sendStatus(
        200
      );
    }
  }
);

/* =========================================================
   CODE CHECK-IN
========================================================= */

app.post(
  "/api/check-in",
  async (req, res) => {

    try {

      const {
        code: guestCode,
        event_key
      } =
        req.body || {};

      if (!guestCode) {

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
            "Chagua Event kwanza."

        });
      }

      const key =
        normalizeEvent(
          event_key
        );

      const cleanCode =
        normalizeCode(
          guestCode
        );

      /*
         STRICT:
         Event + Code.
      */
      const {
        data,
        error
      } =
        await supabase
          .from("guests")
          .select("*")
          .eq(
            "event_key",
            key
          )
          .eq(
            "guest_code",
            cleanCode
          )
          .limit(1);

      if (error) {
        throw error;
      }

      const guest =
        data?.[0];

      if (!guest) {

        return res.status(404).json({

          success:
            false,

          message:
            `Code ${cleanCode} haipo kwenye Event ${key}.`

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
            "Mgeni huyu tayari amesha-check-in.",

          guest

        });
      }

      /*
         Hii update ina is scanned_at null
         ili kuzuia race condition.
      */
      const {
        data: updated,
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
            "event_key",
            key
          )
          .is(
            "scanned_at",
            null
          )
          .select()
          .single();

      if (updateError) {
        throw updateError;
      }

      res.json({

        success:
          true,

        message:
          "Mgeni ameingia ukumbini.",

        event_key:
          key,

        guest:
          updated

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

      const token =
        String(
          req.body?.qr_token ||
          ""
        ).trim();

      if (!token) {

        return res.status(400).json({

          success:
            false,

          message:
            "QR Token inahitajika."

        });
      }

      const {
        data: guest,
        error
      } =
        await supabase
          .from("guests")
          .select("*")
          .eq(
            "qr_token",
            token
          )
          .maybeSingle();

      if (error) {
        throw error;
      }

      if (!guest) {

        return res.status(404).json({

          success:
            false,

          message:
            "QR hii si ya mgeni aliyesajiliwa."

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
            "QR hii tayari imetumika.",

          guest

        });
      }

      const {
        data: updated,
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
            token
          )
          .is(
            "scanned_at",
            null
          )
          .select()
          .single();

      if (updateError) {
        throw updateError;
      }

      res.json({

        success:
          true,

        message:
          "QR Check-in imefanikiwa.",

        event_key:
          updated.event_key,

        guest:
          updated

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
   ATTENDANCE DASHBOARD
========================================================= */

app.get(
  "/api/attendance",
  async (req, res) => {

    try {

      const {
        data,
        error
      } =
        await supabase
          .from("guests")
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

      if (error) {
        throw error;
      }

      res.json({

        success:
          true,

        total:
          data?.length || 0,

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
   ATTENDANCE EXCEL EXPORT
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
                guest.full_name ||
                "",

              "Simu":
                guest.phone ||
                "",

              "Code":
                guest.guest_code ||
                "",

              "Event":
                guest.event_key ||
                "",

              "Aina":
                guest.invitation_type ||
                "",

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

              "QR Token":
                guest.qr_token ||
                "",

              "Kadi URL":
                guest.card_image_url ||
                "",

              "Muda Check-in":
                guest.scanned_at
                  ? new Date(
                      guest.scanned_at
                    ).toLocaleString(
                      "sw-TZ"
                    )
                  : "",

              "Muda Created":
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
        { wch: 22 },
        { wch: 20 },
        { wch: 15 },
        { wch: 18 },
        { wch: 18 },
        { wch: 45 },
        { wch: 65 },
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
   SYSTEM URL
   HII NDIYO OPTION YA URL KWENYE DASHBOARD
========================================================= */

/*
   Inahitaji table:

   system_settings

   columns:
   id
   setting_key
   setting_value
   updated_at

   setting_key mfano:
   system_url
*/

/* GET SYSTEM URL */

app.get(
  "/api/settings/url",
  async (req, res) => {

    try {

      const {
        data,
        error
      } =
        await supabase
          .from(
            "system_settings"
          )
          .select(
            "id,setting_key,setting_value,updated_at"
          )
          .eq(
            "setting_key",
            "system_url"
          )
          .maybeSingle();

      if (error) {

        /*
           Kama table bado haipo,
           Dashboard itaonyesha error badala
           ya kuvunja server.
        */
        return res.status(500).json({

          success:
            false,

          error:
            error.message

        });
      }

      res.json({

        success:
          true,

        url:
          data?.setting_value ||
          ""

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

/* SAVE SYSTEM URL */

app.post(
  "/api/settings/url",
  async (req, res) => {

    try {

      const rawUrl =
        String(
          req.body?.url ||
          ""
        ).trim();

      if (!rawUrl) {

        return res.status(400).json({

          success:
            false,

          message:
            "Weka URL kwanza."

        });
      }

      /*
         Ruhusu http/https tu.
      */
      let parsed;

      try {

        parsed =
          new URL(
            rawUrl
          );

      } catch (e) {

        return res.status(400).json({

          success:
            false,

          message:
            "URL si sahihi."

        });
      }

      if (
        ![
          "http:",
          "https:"
        ].includes(
          parsed.protocol
        )
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "URL lazima ianze na http:// au https://"

        });
      }

      /*
         Ondoa slash ya mwisho.
      */
      const cleanUrl =
        rawUrl.replace(
          /\/+$/,
          ""
        );

      const {
        data,
        error
      } =
        await supabase
          .from(
            "system_settings"
          )
          .upsert(

            {

              setting_key:
                "system_url",

              setting_value:
                cleanUrl,

              updated_at:
                new Date().toISOString()

            },

            {

              onConflict:
                "setting_key"

            }

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
          "URL imehifadhiwa.",

        url:
          data.setting_value

      });

    } catch (error) {

      console.error(
        "SAVE SYSTEM URL:",
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
   START SERVER
========================================================= */

app.listen(
  PORT,
  () => {

    console.log(
      "=============================================="
    );

    console.log(
      `🚀 GeitaCard server running on port ${PORT}`
    );

    console.log(
      "Event System       : ENABLED"
    );

    console.log(
      "Event/Card Split   : ENABLED"
    );

    console.log(
      "Card Upload        : ENABLED"
    );

    console.log(
      "Excel/CSV          : ENABLED"
    );

    console.log(
      "Dashboard Event    : ENABLED"
    );

    console.log(
      "Bulk WhatsApp      : ENABLED"
    );

    console.log(
      "QR Generation      : ENABLED"
    );

    console.log(
      "QR Check-in        : ENABLED"
    );

    console.log(
      "Code Check-in      : ENABLED"
    );

    console.log(
      "Attendance         : ENABLED"
    );

    console.log(
      "System URL Setting : ENABLED"
    );

    console.log(
      `Storage Bucket     : ${STORAGE_BUCKET}`
    );

    console.log(
      "=============================================="
    );
  }
);
