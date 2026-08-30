const express = require("express");
const axios = require("axios");
const XLSX = require("xlsx");
const crypto = require("crypto");
const QRCode = require("qrcode");
const sharp = require("sharp");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(express.json({ limit: "30mb" }));
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
  process.env.INVITE_IMAGE_URL || "";

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

const DEFAULT_EVENT =
  process.env.DEFAULT_EVENT ||
  "DEFAULT_EVENT";

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
   START LOG
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
  "Multi Event Cards: ENABLED"
);

console.log(
  "Event Card Upload: ENABLED"
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
   WEBHOOK VERIFICATION
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

    if (
      mode === "subscribe" &&
      token === VERIFY_TOKEN
    ) {

      return res
        .status(200)
        .send(challenge);

    }

    return res.sendStatus(403);

  }
);

/* =========================================================
   NORMALIZE PHONE
========================================================= */

function normalizePhone(
  phone
) {

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

function normalizeEvent(
  eventKey
) {

  const value =
    String(
      eventKey ||
      DEFAULT_EVENT
    )
      .trim()
      .toUpperCase();

  return value ||
    DEFAULT_EVENT;

}

/* =========================================================
   NORMALIZE CODE
========================================================= */

function normalizeCode(
  code
) {

  return String(
    code || ""
  )
    .trim();

}

/* =========================================================
   SAFE FILE NAME
========================================================= */

function safeFileName(
  value
) {

  return String(
    value || "file"
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
   QR TOKEN
========================================================= */

function createQRToken() {

  return crypto.randomUUID();

}

/* =========================================================
   INVITATION TYPE
========================================================= */

function getInvitationType(
  code
) {

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

function parseBase64Image(
  value
) {

  const text =
    String(
      value || ""
    ).trim();

  if (!text) {

    throw new Error(
      "Kadi ya picha haikutumwa."
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
   GET EVENT CONFIGURATION
========================================================= */

async function getEventConfig(
  eventKey
) {

  const cleanEvent =
    normalizeEvent(
      eventKey
    );

  console.log(
    "Looking for Event:",
    cleanEvent
  );

  const {
    data,
    error
  } =
    await supabase
      .from(
        "events"
      )
      .select(
        "id, event_key, event_name, card_image_url, template_name, template_language, is_active, created_at"
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

    console.error(
      "Event configuration error:",
      error.message
    );

    throw new Error(
      "Imeshindikana kupata taarifa za Event: " +
      error.message
    );

  }

  if (!data) {

    throw new Error(
      `Event "${cleanEvent}" haipo au haijawekwa active.`
    );

  }

  if (
    !data.card_image_url
  ) {

    throw new Error(
      `Event "${cleanEvent}" haina kadi iliyowekwa.`
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
        "Storage cleanup error:",
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
   EVENTS API
   GET ACTIVE EVENTS
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
            "events"
          )
          .select(
            "id, event_key, event_name, card_image_url, template_name, template_language, is_active, created_at"
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

      return res.json({

        success:
          true,

        total:
          data?.length ||
          0,

        events:
          data ||
          []

      });

    } catch (error) {

      console.error(
        "GET events error:",
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
   CREATE EVENT + UPLOAD CARD
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

        return res.status(
          400
        ).json({

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

      if (
        !/^[A-Z0-9_-]+$/.test(
          cleanKey
        )
      ) {

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "Event Key inaweza kuwa na herufi, namba, _ au - tu."

        });

      }

      if (
        !card_image_base64
      ) {

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "Tafadhali upload kadi ya Event."

        });

      }

      /* CHECK IF EVENT EXISTS */

      const {
        data: existingEvent,
        error: existingError
      } =
        await supabase
          .from(
            "events"
          )
          .select(
            "id, event_key"
          )
          .eq(
            "event_key",
            cleanKey
          )
          .maybeSingle();

      if (existingError) {

        throw existingError;

      }

      if (existingEvent) {

        return res.status(
          409
        ).json({

          success:
            false,

          message:
            `Event ${cleanKey} tayari ipo.`,

          event:
            existingEvent

        });

      }

      /* IMAGE */

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
        mime.includes(
          "jpeg"
        ) ||
        mime.includes(
          "jpg"
        )
      ) {

        extension =
          "jpg";

      }

      if (
        mime.includes(
          "webp"
        )
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

      /* UPLOAD */

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

      /* PUBLIC URL */

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

      if (
        !cardImageUrl
      ) {

        throw new Error(
          "Public URL ya kadi haikupatikana."
        );

      }

      /* SAVE EVENT */

      const {
        data,
        error
      } =
        await supabase
          .from(
            "events"
          )
          .insert([

            {

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

            }

          ])
          .select()
          .single();

      if (error) {

        throw error;

      }

      uploadedPath =
        null;

      return res.status(
        201
      ).json({

        success:
          true,

        message:
          "Event imeundwa na kadi imehifadhiwa.",

        event:
          data

      });

    } catch (error) {

      if (
        uploadedPath
      ) {

        await deleteCardFromStorage(
          uploadedPath
        );

      }

      console.error(
        "CREATE EVENT ERROR:",
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

        const cleanKey =
          normalizeEvent(
            event_key
          );

        if (
          !/^[A-Z0-9_-]+$/.test(
            cleanKey
          )
        ) {

          return res.status(
            400
          ).json({

            success:
              false,

            message:
              "Event Key si sahihi."

          });

        }

        updates.event_key =
          cleanKey;

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
          .from(
            "events"
          )
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

      return res.json({

        success:
          true,

        message:
          "Event imebadilishwa.",

        event:
          data

      });

    } catch (error) {

      console.error(
        "UPDATE EVENT ERROR:",
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
   UPLOAD / CHANGE EVENT CARD
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

      if (
        !card_image_base64
      ) {

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "Tafadhali upload picha ya kadi."

        });

      }

      const {
        data: event,
        error: eventError
      } =
        await supabase
          .from(
            "events"
          )
          .select(
            "id, event_key, card_image_url"
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

        return res.status(
          404
        ).json({

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
        mime.includes(
          "jpeg"
        ) ||
        mime.includes(
          "jpg"
        )
      ) {

        extension =
          "jpg";

      }

      if (
        mime.includes(
          "webp"
        )
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
          "Public URL ya kadi haikupatikana."
        );

      }

      const {
        data,
        error
      } =
        await supabase
          .from(
            "events"
          )
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

      return res.json({

        success:
          true,

        message:
          "Kadi ya Event imebadilishwa.",

        event:
          data

      });

    } catch (error) {

      if (
        uploadedPath
      ) {

        await deleteCardFromStorage(
          uploadedPath
        );

      }

      console.error(
        "UPLOAD EVENT CARD ERROR:",
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
   DISABLE EVENT
   HATUFUTI HISTORY YA WAGENI
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
          .from(
            "events"
          )
          .select(
            "id, event_key"
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

        return res.status(
          404
        ).json({

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
          .from(
            "events"
          )
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

      return res.json({

        success:
          true,

        message:
          `Event ${event.event_key} imezimwa.`,

        event:
          data

      });

    } catch (error) {

      console.error(
        "DISABLE EVENT ERROR:",
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
   LEGACY DEFAULT CARD
========================================================= */

async function downloadInvitationImage() {

  if (
    !INVITE_IMAGE_URL
  ) {

    throw new Error(
      "INVITE_IMAGE_URL haijawekwa kwenye Render."
    );

  }

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
   CREATE PERSONAL CARD WITH QR
========================================================= */

async function createCardWithQR(
  qrToken,
  cardImageUrl
) {

  let originalImage;

  if (
    cardImageUrl
  ) {

    console.log(
      "Downloading Event card:"
    );

    console.log(
      cardImageUrl
    );

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

    if (
      !response.data
    ) {

      throw new Error(
        "Kadi ya Event haikupatikana."
      );

    }

    originalImage =
      Buffer.from(
        response.data
      );

  } else {

    originalImage =
      await downloadInvitationImage();

  }

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

  return cardImage;

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

  if (
    !data?.publicUrl
  ) {

    throw new Error(
      "Public URL ya kadi haikupatikana."
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
   FIND DUPLICATE GUEST
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

  if (
    !cleanCode
  ) {

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
      .select(
        "id, full_name, phone, guest_code, event_key, qr_token, card_image_url, invitation_type, attendance_status, scanned_at, created_at"
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

  return data ||
    null;

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

  /*
    HAPA NDIPO KADI YA EVENT
    HUSIKA INAPATIKANA.
  */

  const eventConfig =
    await getEventConfig(
      cleanEvent
    );

  /*
    QR MPYA KWA KILA MGENI
  */

  const qrToken =
    createQRToken();

  console.log(
    "=============================================="
  );

  console.log(
    "Creating personal card"
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
    cleanEvent
  );

  console.log(
    "Event Name:",
    eventConfig.event_name
  );

  console.log(
    "Event Card:",
    eventConfig.card_image_url
  );

  console.log(
    "QR Token:",
    qrToken
  );

  console.log(
    "=============================================="
  );

  const cardBuffer =
    await createCardWithQR(
      qrToken,
      eventConfig.card_image_url
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

  const guestPayload = {

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
      .from(
        "guests"
      )
      .insert([
        guestPayload
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

      const duplicateError =
        new Error(
          `Code ${cleanCode} tayari ipo kwenye event ${cleanEvent}.`
        );

      duplicateError.code =
        "GUEST_EVENT_CODE_DUPLICATE";

      duplicateError.existingGuest =
        existing;

      throw duplicateError;

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
  templateLanguage
) {

  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const imageUrl =
    cardImageUrl ||
    INVITE_IMAGE_URL;

  const components = [];

  /*
    HEADER IMAGE
  */

  if (
    imageUrl
  ) {

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
            templateName ||
            TEMPLATE_NAME,

          language: {

            code:
              templateLanguage ||
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
        normalizeCode(
          code
        );

      const cleanEvent =
        normalizeEvent(
          event_key
        );

      /*
        EVENT + CODE
      */

      const existingGuest =
        await findExistingGuest(
          cleanEvent,
          cleanCode
        );

      if (
        existingGuest
      ) {

        return res.status(
          409
        ).json({

          success:
            false,

          duplicate:
            true,

          message:
            `Code ${cleanCode} tayari ipo kwenye event ${cleanEvent}.`,

          event_key:
            cleanEvent,

          guest:
            existingGuest

        });

      }

      /*
        CREATE CARD
      */

      preparedCard =
        await preparePersonalCard(
          cleanName,
          cleanCode,
          cleanEvent
        );

      /*
        SEND WHATSAPP
      */

      const result =
        await sendInvitation(
          cleanTo,
          cleanName,
          cleanCode,
          preparedCard.cardImageUrl,
          preparedCard.templateName,
          preparedCard.templateLanguage
        );

      /*
        SAVE GUEST
      */

      const guest =
        await saveGuest(
          cleanTo,
          cleanName,
          cleanCode,
          cleanEvent,
          preparedCard.qrToken,
          preparedCard.cardImageUrl
        );

      return res.status(
        200
      ).json({

        success:
          true,

        event_key:
          cleanEvent,

        event_name:
          preparedCard.eventName,

        result:
          result,

        guest:
          guest

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

        return res.status(
          409
        ).json({

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
        "Send invitation error:",
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
        contacts.length ===
        0
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

      const requestEvent =
        req.body.event_key
          ? normalizeEvent(
              req.body.event_key
            )
          : DEFAULT_EVENT;

      const results = [];

      console.log(
        "=============================================="
      );

      console.log(
        "BULK SEND STARTED"
      );

      console.log(
        "Total:",
        contacts.length
      );

      console.log(
        "Request Event:",
        requestEvent
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
          String(
            contact?.to ||
            ""
          ).trim();

        const name =
          String(
            contact?.name ||
            ""
          ).trim();

        const code =
          normalizeCode(
            contact?.code ||
            ""
          );

        /*
          EVENT PRIORITY:

          1. contact.event_key
          2. request event
          3. DEFAULT_EVENT
        */

        const eventKey =
          normalizeEvent(
            contact?.event_key ||
            requestEvent
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

          /*
            DUPLICATE
          */

          const existingGuest =
            await findExistingGuest(
              eventKey,
              code
            );

          if (
            existingGuest
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

              duplicate:
                true,

              error:
                `Code ${code} tayari ipo kwenye event ${eventKey}.`

            });

            continue;

          }

          /*
            HAPA KADI YA EVENT
            HUSIKA INATUMIKA.
          */

          preparedCard =
            await preparePersonalCard(
              name,
              code,
              eventKey
            );

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
              preparedCard.templateLanguage
            );

          /*
            SAVE DATABASE
          */

          const guest =
            await saveGuest(
              to,
              name,
              code,
              eventKey,
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
              eventKey,

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
            "SUCCESS:",
            name,
            eventKey
          );

        } catch (error) {

          if (
            preparedCard?.storagePath
          ) {

            await deleteCardFromStorage(
              preparedCard.storagePath
            );

          }

          const isDuplicate =
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
              eventKey,

            success:
              false,

            duplicate:
              isDuplicate,

            error:
              isDuplicate
                ? error.message
                : (
                    error.response?.data ||
                    error.message
                  )

          });

          console.error(
            "Bulk item error:",
            error.response?.data ||
            error.message
          );

        }

        /*
          PAUSE
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

        duplicates:
          duplicates,

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
        "id, full_name, phone, guest_code, event_key, created_at"
      )
      .eq(
        "phone",
        normalizedPhone
      );

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
      "Find guest error:",
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

  if (updateError) {

    console.error(
      "Attendance update error:",
      updateError.message
    );

    return null;

  }

  return updated;

}

/* =========================================================
   PROCESS WHATSAPP REPLY
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
   WHATSAPP WEBHOOK
========================================================= */

app.post(
  "/webhook",
  async (req, res) => {

    try {

      const body =
        req.body;

      if (
        body.object !==
          "whatsapp_business_account" ||
        !body.entry?.[0]
      ) {

        return res.sendStatus(
          200
        );

      }

      const value =
        body
          .entry[0]
          .changes?.[0]
          ?.value;

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
          value.statuses[0].status
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

      /*
        TEXT
      */

      if (
        message.type ===
        "text"
      ) {

        console.log(
          "Text received:",
          message.text?.body ||
          ""
        );

        return res.sendStatus(
          200
        );

      }

      /*
        OLD BUTTON
      */

      if (
        message.type ===
        "button"
      ) {

        await processAttendanceReply(

          from,

          message
            .button
            ?.payload ||
            "",

          message
            .button
            ?.text ||
            ""

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

        await processAttendanceReply(

          from,

          message
            .interactive
            .button_reply
            ?.id ||
            "",

          message
            .interactive
            .button_reply
            ?.title ||
            ""

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

        throw error;

      }

      return res.json({

        success:
          true,

        total:
          data?.length ||
          0,

        guests:
          data ||
          []

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

              "Event":
                guest.event_key ||
                "",

              "Code":
                guest.guest_code ||
                "",

              "QR Token":
                guest.qr_token ||
                "",

              "Card URL":
                guest.card_image_url ||
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
        { wch: 20 },
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

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="GeitaCard_Wahudhuriaji.xlsx"'
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
      } =
        req.body || {};

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
        normalizeCode(
          code
        );

      /*
        Kama frontend imetuma event_key,
        itatumika.

        Kama haijatumwa,
        DEFAULT_EVENT itatumika
        kama mfumo wako wa zamani.
      */

      const cleanEvent =
        normalizeEvent(
          event_key
        );

      const {
        data: guests,
        error
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

        return res.status(
          500
        ).json({

          success:
            false,

          message:
            error.message

        });

      }

      const guest =
        guests?.[0];

      if (
        !guest
      ) {

        return res.status(
          404
        ).json({

          success:
            false,

          message:
            `Mgeni mwenye code ${guestCode} hakupatikana kwenye event ${cleanEvent}.`

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

        return res.status(
          500
        ).json({

          success:
            false,

          message:
            updateError.message

        });

      }

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

      if (
        !qr_token
      ) {

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

      const {
        data: guest,
        error
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

      if (error) {

        return res.status(
          500
        ).json({

          success:
            false,

          message:
            error.message

        });

      }

      if (
        !guest
      ) {

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

        return res.status(
          500
        ).json({

          success:
            false,

          message:
            updateError.message

        });

      }

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
   HEALTH
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

      multi_event_cards:
        "enabled",

      event_card_upload:
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
      "Event System: ENABLED"
    );

    console.log(
      "Multi Event Cards: ENABLED"
    );

    console.log(
      "Event Card Upload: ENABLED"
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
      "=============================================="
    );

  }
);
