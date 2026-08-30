// ============================================================
// GEITACARD - INDEX.JS
// WhatsApp + Supabase + Events + Excel/CSV + Check-in + QR
// ============================================================

const express = require("express");
const path = require("path");
const axios = require("axios");
const crypto = require("crypto");
const XLSX = require("xlsx");

const {
  createClient
} = require("@supabase/supabase-js");

const app = express();

const PORT = process.env.PORT || 10000;


// ============================================================
// ENVIRONMENT
// ============================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL || "";

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const WHATSAPP_TOKEN =
  process.env.WHATSAPP_TOKEN || "";

const WHATSAPP_PHONE_NUMBER_ID =
  process.env.WHATSAPP_PHONE_NUMBER_ID || "";

const WHATSAPP_API_VERSION =
  process.env.WHATSAPP_API_VERSION ||
  "v23.0";


if (!SUPABASE_URL) {
  console.error("❌ SUPABASE_URL haijawekwa.");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "❌ SUPABASE_SERVICE_ROLE_KEY haijawekwa."
  );
}


const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );


// ============================================================
// EXPRESS
// ============================================================

app.use(
  express.json({
    limit: "25mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "25mb"
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


// ============================================================
// HELPERS
// ============================================================

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}


function upper(value) {
  return clean(value).toUpperCase();
}


function normalizePhone(phone) {

  let value =
    clean(phone)
      .replace(/[^\d+]/g, "");

  if (
    value.startsWith("+")
  ) {
    value =
      value.substring(1);
  }

  if (
    value.startsWith("0")
  ) {
    value =
      "255" +
      value.substring(1);
  }

  return value;
}


function createQRToken() {

  return crypto
    .randomBytes(24)
    .toString("hex");

}


function safeError(error) {

  if (!error) {
    return "Unknown error";
  }

  if (
    typeof error === "string"
  ) {
    return error;
  }

  return (
    error.message ||
    error.error_description ||
    error.error ||
    JSON.stringify(error)
  );

}


function validEventKey(key) {

  return /^[A-Z0-9_-]+$/.test(
    upper(key)
  );

}


function getPublicBaseUrl(req) {

  const envUrl =
    process.env.PUBLIC_BASE_URL;

  if (envUrl) {
    return envUrl.replace(
      /\/$/,
      ""
    );
  }

  const protocol =
    req.headers["x-forwarded-proto"] ||
    req.protocol;

  const host =
    req.get("host");

  return (
    `${protocol}://${host}`
  );
}


// ============================================================
// ROOT
// ============================================================

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


// ============================================================
// HEALTH
// ============================================================

app.get(
  "/health",
  (req, res) => {

    res.json({
      success: true,
      service: "GeitaCard",
      time: new Date().toISOString()
    });

  }
);


// ============================================================
// EVENTS - GET
// ============================================================

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
          .select("*")
          .order(
            "created_at",
            {
              ascending: false
            }
          );

      if (error) {
        throw error;
      }

      res.json({
        success: true,
        events:
          Array.isArray(data)
            ? data
            : []
      });

    } catch (error) {

      console.error(
        "GET EVENTS ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        error:
          safeError(error)
      });

    }

  }
);


// ============================================================
// CREATE EVENT
// ============================================================

app.post(
  "/api/events",
  async (req, res) => {

    try {

      const eventKey =
        upper(
          req.body.event_key
        );

      const eventName =
        clean(
          req.body.event_name
        ) ||
        eventKey;

      const templateName =
        clean(
          req.body.template_name
        );

      const templateLanguage =
        clean(
          req.body.template_language
        ) ||
        "sw";

      const cardBase64 =
        clean(
          req.body.card_image_base64
        );

      if (!eventKey) {

        return res.status(400).json({
          success: false,
          error:
            "Event Key inahitajika."
        });

      }

      if (
        !validEventKey(
          eventKey
        )
      ) {

        return res.status(400).json({
          success: false,
          error:
            "Event Key inaweza kuwa na A-Z, 0-9, _ na - tu."
        });

      }

      // --------------------------------------------------------
      // CHECK DUPLICATE
      // --------------------------------------------------------

      const {
        data: existing,
        error: existingError
      } =
        await supabase
          .from("events")
          .select("*")
          .eq(
            "event_key",
            eventKey
          )
          .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (existing) {

        return res.status(409).json({
          success: false,
          error:
            `Event ${eventKey} tayari ipo.`
        });

      }

      // --------------------------------------------------------
      // CARD URL
      // --------------------------------------------------------

      let cardImageUrl = "";

      /*
        Kama card_image_base64 ipo, tunajaribu kui-save
        kwenye Supabase Storage bucket "event-cards".

        Kama storage haipo, event bado inaweza kutengenezwa
        bila card URL.
      */

      if (cardBase64) {

        try {

          cardImageUrl =
            await uploadBase64Card(
              cardBase64,
              req.body.card_image_name,
              eventKey
            );

        } catch (uploadError) {

          console.error(
            "CARD UPLOAD ERROR:",
            uploadError
          );

          return res.status(500).json({
            success: false,
            error:
              "Event haikuundwa kwa sababu Kadi haikuweza ku-upload: " +
              safeError(uploadError)
          });

        }

      }

      // --------------------------------------------------------
      // INSERT EVENT
      // --------------------------------------------------------

      const {
        data,
        error
      } =
        await supabase
          .from("events")
          .insert({

            event_key:
              eventKey,

            event_name:
              eventName,

            template_name:
              templateName,

            template_language:
              templateLanguage,

            card_image_url:
              cardImageUrl,

            active:
              true

          })
          .select("*")
          .single();

      if (error) {
        throw error;
      }

      res.status(201).json({

        success: true,

        message:
          "Event imetengenezwa na Kadi imehifadhiwa.",

        event:
          data

      });

    } catch (error) {

      console.error(
        "CREATE EVENT ERROR:",
        error
      );

      res.status(500).json({

        success: false,

        error:
          safeError(error)

      });

    }

  }
);


// ============================================================
// UPLOAD EVENT CARD
// ============================================================

async function uploadBase64Card(
  base64,
  originalName,
  eventKey
) {

  const match =
    base64.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
    );

  if (!match) {

    throw new Error(
      "Image Base64 si sahihi."
    );

  }

  const mimeType =
    match[1];

  const rawBase64 =
    match[2];

  const buffer =
    Buffer.from(
      rawBase64,
      "base64"
    );

  let extension =
    "jpg";

  if (
    mimeType ===
    "image/png"
  ) {
    extension = "png";
  }

  if (
    mimeType ===
    "image/webp"
  ) {
    extension = "webp";
  }

  const safeName =
    clean(
      originalName
    )
      .replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

  const fileName =
    `${eventKey}/${Date.now()}-${safeName || `card.${extension}`}`;

  const {
    error
  } =
    await supabase.storage
      .from("event-cards")
      .upload(
        fileName,
        buffer,
        {
          contentType:
            mimeType,

          upsert:
            true
        }
      );

  if (error) {
    throw error;
  }

  const {
    data
  } =
    supabase.storage
      .from("event-cards")
      .getPublicUrl(
        fileName
      );

  return (
    data?.publicUrl ||
    ""
  );

}


// ============================================================
// CHANGE EVENT CARD
// ============================================================

app.post(
  "/api/events/:id/card",
  async (req, res) => {

    try {

      const id =
        clean(
          req.params.id
        );

      const base64 =
        clean(
          req.body.card_image_base64
        );

      const name =
        clean(
          req.body.card_image_name
        );

      if (!id) {

        return res.status(400).json({
          success: false,
          error:
            "Event ID haipo."
        });

      }

      if (!base64) {

        return res.status(400).json({
          success: false,
          error:
            "Kadi mpya haipo."
        });

      }

      const {
        data: event,
        error: eventError
      } =
        await supabase
          .from("events")
          .select("*")
          .eq(
            "id",
            id
          )
          .single();

      if (eventError) {
        throw eventError;
      }

      const url =
        await uploadBase64Card(
          base64,
          name,
          upper(
            event.event_key
          )
        );

      const {
        data,
        error
      } =
        await supabase
          .from("events")
          .update({

            card_image_url:
              url,

            updated_at:
              new Date().toISOString()

          })
          .eq(
            "id",
            id
          )
          .select("*")
          .single();

      if (error) {
        throw error;
      }

      res.json({

        success: true,

        message:
          "Kadi ya Event imebadilishwa.",

        event:
          data

      });

    } catch (error) {

      console.error(
        "CHANGE CARD ERROR:",
        error
      );

      res.status(500).json({

        success: false,

        error:
          safeError(error)

      });

    }

  }
);


// ============================================================
// CHANGE CARD URL DIRECTLY
// ============================================================

app.post(
  "/api/events/:id/card-url",
  async (req, res) => {

    try {

      const id =
        clean(
          req.params.id
        );

      const cardImageUrl =
        clean(
          req.body.card_image_url
        );

      if (!id) {

        return res.status(400).json({
          success: false,
          error:
            "Event ID haipo."
        });

      }

      if (!cardImageUrl) {

        return res.status(400).json({
          success: false,
          error:
            "Card URL haipo."
        });

      }

      if (
        !/^https?:\/\//i.test(
          cardImageUrl
        )
      ) {

        return res.status(400).json({
          success: false,
          error:
            "Card URL lazima ianze na http:// au https://"
        });

      }

      const {
        data,
        error
      } =
        await supabase
          .from("events")
          .update({

            card_image_url:
              cardImageUrl,

            updated_at:
              new Date().toISOString()

          })
          .eq(
            "id",
            id
          )
          .select("*")
          .single();

      if (error) {
        throw error;
      }

      res.json({

        success: true,

        message:
          "URL ya Kadi imebadilishwa.",

        event:
          data

      });

    } catch (error) {

      console.error(
        "CARD URL ERROR:",
        error
      );

      res.status(500).json({

        success: false,

        error:
          safeError(error)

      });

    }

  }
);


// ============================================================
// DISABLE EVENT
// ============================================================

app.delete(
  "/api/events/:id",
  async (req, res) => {

    try {

      const id =
        clean(
          req.params.id
        );

      const {
        data,
        error
      } =
        await supabase
          .from("events")
          .update({

            active:
              false,

            updated_at:
              new Date().toISOString()

          })
          .eq(
            "id",
            id
          )
          .select("*")
          .single();

      if (error) {
        throw error;
      }

      res.json({

        success: true,

        message:
          "Event imezimwa.",

        event:
          data

      });

    } catch (error) {

      console.error(
        "DISABLE EVENT ERROR:",
        error
      );

      res.status(500).json({

        success: false,

        error:
          safeError(error)

      });

    }

  }
);


// ============================================================
// FIND EVENT
// ============================================================

async function getEventByKey(
  eventKey
) {

  const key =
    upper(eventKey);

  const {
    data,
    error
  } =
    await supabase
      .from("events")
      .select("*")
      .eq(
        "event_key",
        key
      )
      .eq(
        "active",
        true
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;

}


// ============================================================
// NORMALIZE GUEST DATA
// ============================================================

function guestPayload(
  contact,
  eventKey
) {

  return {

    full_name:
      clean(
        contact.name
      ),

    phone:
      normalizePhone(
        contact.to
      ),

    guest_code:
      clean(
        contact.code
      ),

    event_key:
      upper(
        eventKey
      )

  };

}


// ============================================================
// CREATE / UPDATE GUEST
// ============================================================

async function createGuest(
  contact,
  event
) {

  const phone =
    normalizePhone(
      contact.to
    );

  const code =
    clean(
      contact.code
    );

  const eventKey =
    upper(
      event.event_key
    );

  if (!phone) {
    throw new Error(
      "Namba ya simu haipo."
    );
  }

  if (!code) {
    throw new Error(
      "Code haipo."
    );
  }

  // ----------------------------------------------------------
  // FIND EXISTING GUEST
  // ----------------------------------------------------------

  const {
    data: existing,
    error: findError
  } =
    await supabase
      .from("guests")
      .select("*")
      .eq(
        "guest_code",
        code
      )
      .eq(
        "event_key",
        eventKey
      )
      .maybeSingle();

  if (findError) {
    throw findError;
  }

  if (existing) {

    return {
      guest:
        existing,

      created:
        false,

      duplicate:
        true

    };

  }

  // ----------------------------------------------------------
  // QR
  // ----------------------------------------------------------

  const qrToken =
    createQRToken();

  const {
    data,
    error
  } =
    await supabase
      .from("guests")
      .insert({

        full_name:
          clean(
            contact.name
          ),

        phone:
          phone,

        guest_code:
          code,

        event_key:
          eventKey,

        attendance_status:
          "pending",

        qr_token:
          qrToken,

        scanned_at:
          null,

        created_at:
          new Date().toISOString()

      })
      .select("*")
      .single();

  if (error) {
    throw error;
  }

  return {

    guest:
      data,

    created:
      true,

    duplicate:
      false

  };

}


// ============================================================
// WHATSAPP SEND TEXT
// ============================================================

async function sendWhatsAppText(
  phone,
  text
) {

  if (
    !WHATSAPP_TOKEN ||
    !WHATSAPP_PHONE_NUMBER_ID
  ) {

    throw new Error(
      "WhatsApp environment variables hazijawekwa."
    );

  }

  const url =
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const response =
    await axios.post(
      url,

      {

        messaging_product:
          "whatsapp",

        recipient_type:
          "individual",

        to:
          phone,

        type:
          "text",

        text: {
          preview_url:
            true,

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


// ============================================================
// WHATSAPP IMAGE
// ============================================================

async function sendWhatsAppImage(
  phone,
  imageUrl,
  caption
) {

  if (
    !WHATSAPP_TOKEN ||
    !WHATSAPP_PHONE_NUMBER_ID
  ) {

    throw new Error(
      "WhatsApp environment variables hazijawekwa."
    );

  }

  if (!imageUrl) {

    return sendWhatsAppText(
      phone,
      caption
    );

  }

  const url =
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const response =
    await axios.post(

      url,

      {

        messaging_product:
          "whatsapp",

        recipient_type:
          "individual",

        to:
          phone,

        type:
          "image",

        image: {

          link:
            imageUrl,

          caption:
            caption

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


// ============================================================
// INVITATION MESSAGE
// ============================================================

function buildInvitationMessage(
  guest,
  event,
  baseUrl
) {

  const name =
    clean(
      guest.full_name
    );

  const code =
    clean(
      guest.guest_code
    );

  const eventName =
    clean(
      event.event_name
    ) ||
    event.event_key;

  const qrToken =
    clean(
      guest.qr_token
    );

  const qrUrl =
    qrToken
      ? `${baseUrl}/q/${encodeURIComponent(qrToken)}`
      : "";

  return (

`Habari ${name},

Unakaribishwa kwenye ${eventName}.

Tafadhali kumbuka kufika na kadi hii ukumbini.

🎟️ Code: ${code}

Karibu sana GeitaCard.

Tafadhali thibitisha ushiriki wako.

${qrUrl ? `QR Token: ${qrToken}` : ""}`

  );

}


// ============================================================
// SEND SINGLE INVITATION
// ============================================================

app.post(
  "/send",
  async (req, res) => {

    try {

      const eventKey =
        upper(
          req.body.event_key
        );

      const contact =
        req.body.contact || {};

      if (!eventKey) {

        return res.status(400).json({
          success: false,
          error:
            "Event Key inahitajika."
        });

      }

      const event =
        await getEventByKey(
          eventKey
        );

      if (!event) {

        return res.status(404).json({
          success: false,
          error:
            `Event ${eventKey} haipo au imezimwa.`
        });

      }

      const result =
        await createGuest(
          contact,
          event
        );

      const guest =
        result.guest;

      const phone =
        normalizePhone(
          contact.to
        );

      const baseUrl =
        getPublicBaseUrl(
          req
        );

      const message =
        buildInvitationMessage(
          guest,
          event,
          baseUrl
        );

      let whatsappResult;

      if (
        event.card_image_url
      ) {

        whatsappResult =
          await sendWhatsAppImage(
            phone,
            event.card_image_url,
            message
          );

      } else {

        whatsappResult =
          await sendWhatsAppText(
            phone,
            message
          );

      }

      await supabase
        .from("guests")
        .update({

          sent_at:
            new Date().toISOString(),

          whatsapp_message_id:
            whatsappResult?.messages?.[0]?.id ||
            null

        })
        .eq(
          "id",
          guest.id
        );

      res.json({

        success: true,

        message:
          "Invitation imetumwa.",

        guest:
          guest,

        event:
          event,

        duplicate:
          result.duplicate,

        whatsapp:
          whatsappResult

      });

    } catch (error) {

      console.error(
        "SEND ERROR:",
        error
      );

      res.status(500).json({

        success: false,

        error:
          safeError(error)

      });

    }

  }
);


// ============================================================
// BULK SEND
// ============================================================

app.post(
  "/send-bulk",
  async (req, res) => {

    try {

      const eventKey =
        upper(
          req.body.event_key
        );

      const contacts =
        Array.isArray(
          req.body.contacts
        )
          ? req.body.contacts
          : [];

      if (!eventKey) {

        return res.status(400).json({
          success: false,
          error:
            "Event Key inahitajika."
        });

      }

      if (!contacts.length) {

        return res.status(400).json({
          success: false,
          error:
            "Hakuna wageni wa kutuma."
        });

      }

      const event =
        await getEventByKey(
          eventKey
        );

      if (!event) {

        return res.status(404).json({
          success: false,
          error:
            `Event ${eventKey} haipo au imezimwa.`
        });

      }

      const baseUrl =
        getPublicBaseUrl(
          req
        );

      const results = [];

      let successful = 0;
      let failed = 0;
      let duplicates = 0;

      for (
        let i = 0;
        i < contacts.length;
        i++
      ) {

        const contact =
          contacts[i];

        try {

          // ----------------------------------------------
          // IMPORTANT:
          // Event ya kila Excel row inatoka kwenye
          // event_key iliyochaguliwa dashboard.
          // ----------------------------------------------

          const rowEventKey =
            upper(
              contact.event_key ||
              eventKey
            );

          const rowEvent =
            await getEventByKey(
              rowEventKey
            );

          if (!rowEvent) {

            throw new Error(
              `Event ${rowEventKey} haipo.`
            );

          }

          const guestResult =
            await createGuest(
              contact,
              rowEvent
            );

          const guest =
            guestResult.guest;

          if (
            guestResult.duplicate
          ) {

            duplicates++;

          }

          const phone =
            normalizePhone(
              contact.to
            );

          const message =
            buildInvitationMessage(
              guest,
              rowEvent,
              baseUrl
            );

          let whatsappResult;

          if (
            rowEvent.card_image_url
          ) {

            whatsappResult =
              await sendWhatsAppImage(
                phone,
                rowEvent.card_image_url,
                message
              );

          } else {

            whatsappResult =
              await sendWhatsAppText(
                phone,
                message
              );

          }

          await supabase
            .from("guests")
            .update({

              sent_at:
                new Date().toISOString(),

              whatsapp_message_id:
                whatsappResult?.messages?.[0]?.id ||
                null

            })
            .eq(
              "id",
              guest.id
            );

          successful++;

          results.push({

            success:
              true,

            name:
              guest.full_name,

            phone:
              guest.phone,

            code:
              guest.guest_code,

            event_key:
              rowEvent.event_key,

            duplicate:
              guestResult.duplicate

          });

          /*
            Delay kidogo kati ya messages.
            Inasaidia kupunguza speed kubwa sana.
          */

          await sleep(
            1200
          );

        } catch (error) {

          failed++;

          results.push({

            success:
              false,

            name:
              clean(
                contact.name
              ),

            phone:
              normalizePhone(
                contact.to
              ),

            code:
              clean(
                contact.code
              ),

            event_key:
              upper(
                contact.event_key ||
                eventKey
              ),

            error:
              safeError(error)

          });

        }

      }

      res.json({

        success:
          true,

        message:
          "Bulk send imekamilika.",

        total:
          contacts.length,

        successful:
          successful,

        failed:
          failed,

        duplicates:
          duplicates,

        event_key:
          event.event_key,

        event_name:
          event.event_name,

        results:
          results

      });

    } catch (error) {

      console.error(
        "BULK ERROR:",
        error
      );

      res.status(500).json({

        success:
          false,

        error:
          safeError(error)

      });

    }

  }
);


// ============================================================
// SLEEP
// ============================================================

function sleep(
  milliseconds
) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
  );

}


// ============================================================
// CHECK-IN BY CODE
// ============================================================

app.post(
  "/api/check-in",
  async (req, res) => {

    try {

      const code =
        clean(
          req.body.code
        );

      const eventKey =
        upper(
          req.body.event_key
        );

      if (!code) {

        return res.status(400).json({
          success: false,
          message:
            "Code inahitajika."
        });

      }

      if (!eventKey) {

        return res.status(400).json({
          success: false,
          message:
            "Event Key inahitajika."
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
            "guest_code",
            code
          )
          .eq(
            "event_key",
            eventKey
          )
          .maybeSingle();

      if (error) {
        throw error;
      }

      if (!guest) {

        return res.status(404).json({
          success: false,
          message:
            "Mgeni hakupatikana kwenye Event hii."
        });

      }

      if (
        guest.scanned_at
      ) {

        return res.status(409).json({

          success:
            false,

          message:
            "Mgeni huyu tayari amesha-check-in.",

          guest:
            guest

        });

      }

      const scannedAt =
        new Date().toISOString();

      const {
        data: updated,
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
          .is(
            "scanned_at",
            null
          )
          .select("*")
          .maybeSingle();

      if (updateError) {
        throw updateError;
      }

      if (!updated) {

        const {
          data: already
        } =
          await supabase
            .from("guests")
            .select("*")
            .eq(
              "id",
              guest.id
            )
            .single();

        return res.status(409).json({

          success:
            false,

          message:
            "Mgeni tayari amesha-check-in.",

          guest:
            already

        });

      }

      res.json({

        success:
          true,

        message:
          "Check-in imefanikiwa.",

        guest:
          updated

      });

    } catch (error) {

      console.error(
        "CHECK-IN ERROR:",
        error
      );

      res.status(500).json({

        success:
          false,

        message:
          safeError(error)

      });

    }

  }
);


// ============================================================
// CHECK-IN BY QR
// ============================================================

app.post(
  "/api/check-in-qr",
  async (req, res) => {

    try {

      const qrToken =
        clean(
          req.body.qr_token
        );

      if (!qrToken) {

        return res.status(400).json({
          success: false,
          message:
            "QR Token haipo."
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
            qrToken
          )
          .maybeSingle();

      if (error) {
        throw error;
      }

      if (!guest) {

        return res.status(404).json({
          success: false,
          message:
            "QR hii haijatambuliwa."
        });

      }

      if (
        guest.scanned_at
      ) {

        return res.status(409).json({

          success:
            false,

          message:
            "QR hii tayari imesha-check-in.",

          guest:
            guest

        });

      }

      const scannedAt =
        new Date().toISOString();

      const {
        data: updated,
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
          .is(
            "scanned_at",
            null
          )
          .select("*")
          .maybeSingle();

      if (updateError) {
        throw updateError;
      }

      if (!updated) {

        const {
          data: already
        } =
          await supabase
            .from("guests")
            .select("*")
            .eq(
              "id",
              guest.id
            )
            .single();

        return res.status(409).json({

          success:
            false,

          message:
            "QR hii tayari imesha-check-in.",

          guest:
            already

        });

      }

      res.json({

        success:
          true,

        message:
          "QR Check-in imefanikiwa.",

        guest:
          updated

      });

    } catch (error) {

      console.error(
        "QR CHECK-IN ERROR:",
        error
      );

      res.status(500).json({

        success:
          false,

        message:
          safeError(error)

      });

    }

  }
);


// ============================================================
// QR SHORT URL
// ============================================================

app.get(
  "/q/:token",
  async (req, res) => {

    try {

      const token =
        clean(
          req.params.token
        );

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

        return res.status(404).send(
          "QR Token haijatambuliwa."
        );

      }

      res.send(`

<!DOCTYPE html>

<html lang="sw">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width,initial-scale=1.0">

<title>GeitaCard QR</title>

<style>

body{
font-family:Arial,sans-serif;
background:#f3f4f6;
padding:30px;
text-align:center;
}

.box{
background:white;
max-width:500px;
margin:auto;
padding:25px;
border-radius:15px;
box-shadow:0 2px 10px rgba(0,0,0,.1);
}

h1{
color:#111827;
}

</style>

</head>

<body>

<div class="box">

<h1>🎟️ GeitaCard</h1>

<h2>
${escapeHtmlServer(
  guest.full_name
)}
</h2>

<p>
Code:
<strong>
${escapeHtmlServer(
  guest.guest_code
)}
</strong>
</p>

<p>
Event:
<strong>
${escapeHtmlServer(
  guest.event_key
)}
</strong>
</p>

<p>
QR Token hii ni ya mgeni huyu pekee.
</p>

</div>

</body>

</html>

      `);

    } catch (error) {

      console.error(
        "QR PAGE ERROR:",
        error
      );

      res.status(500).send(
        "Server error."
      );

    }

  }
);


// ============================================================
// ESCAPE SERVER HTML
// ============================================================

function escapeHtmlServer(
  value
) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


// ============================================================
// ATTENDANCE
// ============================================================

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

      res.json({

        success:
          true,

        guests:
          Array.isArray(data)
            ? data
            : []

      });

    } catch (error) {

      console.error(
        "ATTENDANCE ERROR:",
        error
      );

      res.status(500).json({

        success:
          false,

        error:
          safeError(error)

      });

    }

  }
);


// ============================================================
// ATTENDANCE EXPORT
// ============================================================

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
          .select("*")
          .order(
            "created_at",
            {
              ascending:
                true
            }
          );

      if (error) {
        throw error;
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

            "Ushiriki":
              guest.attendance_status || "pending",

            "Check-in":
              guest.scanned_at
                ? "Ndio"
                : "Hapana",

            "Muda wa Check-in":
              guest.scanned_at || "",

            "QR Token":
              guest.qr_token || ""

          })
        );

      const workbook =
        XLSX.utils.book_new();

      const worksheet =
        XLSX.utils.json_to_sheet(
          rows
        );

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
        'attachment; filename="geitacard-attendance.xlsx"'
      );

      res.send(
        buffer
      );

    } catch (error) {

      console.error(
        "EXPORT ERROR:",
        error
      );

      res.status(500).send(
        "Imeshindikana kutengeneza Excel."
      );

    }

  }
);


// ============================================================
// WHATSAPP WEBHOOK VERIFY
// ============================================================

app.get(
  "/webhook",
  (req, res) => {

    const mode =
      req.query["hub.mode"];

    const token =
      req.query["hub.verify_token"];

    const challenge =
      req.query["hub.challenge"];

    const verifyToken =
      process.env.WHATSAPP_VERIFY_TOKEN ||
      "";

    if (
      mode === "subscribe" &&
      token === verifyToken
    ) {

      console.log(
        "✅ WhatsApp webhook verified."
      );

      return res.status(200).send(
        challenge
      );

    }

    return res.sendStatus(
      403
    );

  }
);


// ============================================================
// WHATSAPP WEBHOOK
// ============================================================

app.post(
  "/webhook",
  async (req, res) => {

    try {

      console.log(
        "WHATSAPP WEBHOOK:",
        JSON.stringify(
          req.body
        )
      );

      /*
        Hapa unaweza kupokea:
        - Button replies
        - Messages
        - Status updates

        Kwa sasa tunatuma 200 haraka kwa Meta.
      */

      res.sendStatus(
        200
      );

    } catch (error) {

      console.error(
        "WEBHOOK ERROR:",
        error
      );

      res.sendStatus(
        200
      );

    }

  }
);


// ============================================================
// GENERIC 404 API
// ============================================================

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


// ============================================================
// SERVER ERROR
// ============================================================

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      "SERVER ERROR:",
      error
    );

    res.status(500).json({

      success:
        false,

      error:
        "Server error."

    });

  }
);


// ============================================================
// START
// ============================================================

app.listen(
  PORT,
  () => {

    console.log(
      "================================================"
    );

    console.log(
      "🚀 GeitaCard Server imeanza"
    );

    console.log(
      `🌐 PORT: ${PORT}`
    );

    console.log(
      `📁 PUBLIC: ${path.join(__dirname, "public")}`
    );

    console.log(
      `🗄️ Supabase: ${
        SUPABASE_URL
          ? "CONNECTED"
          : "MISSING"
      }`
    );

    console.log(
      `📱 WhatsApp: ${
        WHATSAPP_TOKEN &&
        WHATSAPP_PHONE_NUMBER_ID
          ? "CONFIGURED"
          : "MISSING"
      }`
    );

    console.log(
      "================================================"
    );

  }
);
