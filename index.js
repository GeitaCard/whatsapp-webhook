const express = require("express");
const axios = require("axios");
const XLSX = require("xlsx");
const crypto = require("crypto");
const QRCode = require("qrcode");
const sharp = require("sharp");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

const app = express();

/* =========================================================
   CONFIG
========================================================= */

const PORT = Number(process.env.PORT || 10000);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const GRAPH_VERSION =
  process.env.GRAPH_VERSION || "v23.0";

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
   QR reference position.
   Badilisha kwenye Environment Variables kama
   QR yako inahitaji sehemu nyingine.
*/
const QR_X = Number(process.env.QR_X || 425);
const QR_Y = Number(process.env.QR_Y || 1190);
const QR_SIZE = Number(process.env.QR_SIZE || 190);

const BULK_DELAY_MS =
  Number(process.env.BULK_DELAY_MS || 1000);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "❌ SUPABASE_URL au SUPABASE_SERVICE_ROLE_KEY haipo."
  );
}

const supabase = createClient(
  SUPABASE_URL || "",
  SUPABASE_SERVICE_ROLE_KEY || ""
);

app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));
app.use(express.static(path.join(__dirname, "public")));

/* =========================================================
   HELPERS
========================================================= */

function eventKey(value) {
  const key = String(value || "")
    .trim()
    .toUpperCase();

  if (!key) {
    throw new Error("Event Key inahitajika.");
  }

  if (!/^[A-Z0-9_-]+$/.test(key)) {
    throw new Error(
      "Event Key inaweza kuwa na A-Z, 0-9, _ na - tu."
    );
  }

  return key;
}

function phone(value) {
  let p = String(value || "")
    .trim()
    .replace(/\D/g, "");

  if (p.startsWith("0") && p.length === 10) {
    p = "255" + p.substring(1);
  }

  return p;
}

function code(value) {
  return String(value || "").trim();
}

function safe(value) {
  return String(value || "file")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .substring(0, 100);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function qrToken() {
  return crypto.randomUUID();
}

function invitationType(value) {
  const c = code(value).toUpperCase();

  if (c.endsWith("-KAMATI")) return "KAMATI";
  if (c.endsWith("-SINGLE")) return "SINGLE";

  return "UNKNOWN";
}

function parseImage(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    throw new Error("Kadi ya picha haikutumwa.");
  }

  let mime = "image/png";
  let base64 = raw;

  const match = raw.match(
    /^data:([^;]+);base64,(.+)$/s
  );

  if (match) {
    mime = match[1];
    base64 = match[2];
  }

  if (!/^image\/(png|jpeg|jpg|webp)$/i.test(mime)) {
    throw new Error(
      "Kadi lazima iwe PNG, JPG/JPEG au WEBP."
    );
  }

  const buffer = Buffer.from(base64, "base64");

  if (!buffer.length) {
    throw new Error("Picha ya kadi imeharibika.");
  }

  return { buffer, mime };
}

async function deleteStorage(filePath) {
  if (!filePath) return;

  try {
    await supabase
      .storage
      .from(STORAGE_BUCKET)
      .remove([filePath]);
  } catch (e) {
    console.error(
      "Storage cleanup:",
      e.message
    );
  }
}

/* =========================================================
   STORAGE
========================================================= */

async function uploadStorage(
  buffer,
  contentType,
  filePath
) {
  const { error } = await supabase
    .storage
    .from(STORAGE_BUCKET)
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
      "Storage upload failed: " +
      error.message
    );
  }

  const { data } =
    supabase
      .storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

  if (!data?.publicUrl) {
    throw new Error(
      "Public URL ya kadi haikupatikana."
    );
  }

  return {
    path: filePath,
    url: data.publicUrl
  };
}

/* =========================================================
   GET EVENT
========================================================= */

async function getEvent(key) {
  const cleanKey = eventKey(key);

  const { data, error } =
    await supabase
      .from("events")
      .select(
        "id,event_key,event_name,card_image_url,template_name,template_language,is_active,created_at"
      )
      .eq("event_key", cleanKey)
      .eq("is_active", true)
      .maybeSingle();

  if (error) {
    throw new Error(
      "Event database error: " +
      error.message
    );
  }

  if (!data) {
    throw new Error(
      `Event "${cleanKey}" haipo au haijawekwa active.`
    );
  }

  if (!data.card_image_url) {
    throw new Error(
      `Event "${cleanKey}" haina Kadi.`
    );
  }

  if (
    String(data.event_key)
      .trim()
      .toUpperCase() !== cleanKey
  ) {
    throw new Error(
      "Event/Card mismatch imezuiwa."
    );
  }

  return data;
}

/* =========================================================
   EVENTS
========================================================= */

app.get("/api/events", async (req, res) => {
  try {
    const { data, error } =
      await supabase
        .from("events")
        .select(
          "id,event_key,event_name,card_image_url,template_name,template_language,is_active,created_at"
        )
        .eq("is_active", true)
        .order("created_at", {
          ascending: false
        });

    if (error) throw error;

    res.json({
      success: true,
      total: data?.length || 0,
      events: data || []
    });
  } catch (e) {
    console.error(
      "GET EVENTS:",
      e.message
    );

    res.status(500).json({
      success: false,
      error: e.message
    });
  }
});

/* =========================================================
   CREATE EVENT + KADI
========================================================= */

app.post("/api/events", async (req, res) => {
  let uploadedPath = null;

  try {
    const {
      event_key,
      event_name,
      template_name,
      template_language,
      card_image_base64,
      card_image_name
    } = req.body || {};

    const key = eventKey(event_key);

    if (!card_image_base64) {
      return res.status(400).json({
        success: false,
        message:
          "Tafadhali upload Kadi ya Event."
      });
    }

    const { data: exists, error: existsError } =
      await supabase
        .from("events")
        .select("id,event_key")
        .eq("event_key", key)
        .maybeSingle();

    if (existsError) throw existsError;

    if (exists) {
      return res.status(409).json({
        success: false,
        message:
          `Event ${key} tayari ipo.`
      });
    }

    const { buffer, mime } =
      parseImage(card_image_base64);

    let ext = "png";

    if (/jpeg|jpg/i.test(mime)) {
      ext = "jpg";
    }

    if (/webp/i.test(mime)) {
      ext = "webp";
    }

    const original =
      safe(
        card_image_name ||
        `${key}.${ext}`
      );

    const filePath =
      `events/${safe(key)}/${Date.now()}-${original}.${ext}`;

    const uploaded =
      await uploadStorage(
        buffer,
        mime,
        filePath
      );

    uploadedPath = uploaded.path;

    const { data, error } =
      await supabase
        .from("events")
        .insert([{
          event_key: key,
          event_name:
            String(
              event_name || key
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
          is_active: true
        }])
        .select()
        .single();

    if (error) throw error;

    uploadedPath = null;

    res.status(201).json({
      success: true,
      message:
        `Event ${key} imeundwa na Kadi imehifadhiwa.`,
      event: data
    });
  } catch (e) {
    if (uploadedPath) {
      await deleteStorage(
        uploadedPath
      );
    }

    console.error(
      "CREATE EVENT:",
      e.message
    );

    res.status(500).json({
      success: false,
      error: e.message
    });
  }
});

/* =========================================================
   CHANGE EVENT CARD
========================================================= */

app.post(
  "/api/events/:id/card",
  async (req, res) => {
    let uploadedPath = null;

    try {
      const {
        card_image_base64,
        card_image_name
      } = req.body || {};

      if (!card_image_base64) {
        return res.status(400).json({
          success: false,
          message:
            "Tafadhali upload Kadi mpya."
        });
      }

      const { data: event, error } =
        await supabase
          .from("events")
          .select(
            "id,event_key,event_name,card_image_url,template_name,template_language,is_active"
          )
          .eq("id", req.params.id)
          .maybeSingle();

      if (error) throw error;

      if (!event) {
        return res.status(404).json({
          success: false,
          message:
            "Event haikupatikana."
        });
      }

      const { buffer, mime } =
        parseImage(card_image_base64);

      let ext = "png";

      if (/jpeg|jpg/i.test(mime)) {
        ext = "jpg";
      }

      if (/webp/i.test(mime)) {
        ext = "webp";
      }

      const original =
        safe(
          card_image_name ||
          `${event.event_key}.${ext}`
        );

      const filePath =
        `events/${safe(event.event_key)}/${Date.now()}-${original}.${ext}`;

      const uploaded =
        await uploadStorage(
          buffer,
          mime,
          filePath
        );

      uploadedPath = uploaded.path;

      const { data, error: updateError } =
        await supabase
          .from("events")
          .update({
            card_image_url:
              uploaded.url
          })
          .eq("id", event.id)
          .select()
          .single();

      if (updateError) {
        throw updateError;
      }

      uploadedPath = null;

      res.json({
        success: true,
        message:
          `Kadi ya Event ${event.event_key} imebadilishwa.`,
        event: data
      });
    } catch (e) {
      if (uploadedPath) {
        await deleteStorage(
          uploadedPath
        );
      }

      console.error(
        "CHANGE EVENT CARD:",
        e.message
      );

      res.status(500).json({
        success: false,
        error: e.message
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
      const { data: event, error } =
        await supabase
          .from("events")
          .select(
            "id,event_key"
          )
          .eq("id", req.params.id)
          .maybeSingle();

      if (error) throw error;

      if (!event) {
        return res.status(404).json({
          success: false,
          message:
            "Event haikupatikana."
        });
      }

      const { data, error: updateError } =
        await supabase
          .from("events")
          .update({
            is_active: false
          })
          .eq("id", event.id)
          .select()
          .single();

      if (updateError) {
        throw updateError;
      }

      res.json({
        success: true,
        message:
          `Event ${event.event_key} imezimwa.`,
        event: data
      });
    } catch (e) {
      console.error(
        "DISABLE EVENT:",
        e.message
      );

      res.status(500).json({
        success: false,
        error: e.message
      });
    }
  }
);

/* =========================================================
   CREATE PERSONAL CARD + QR
========================================================= */

async function makeGuestCard(
  name,
  guestCode,
  selectedEvent
) {
  const token = qrToken();

  /*
    MUHIMU:
    Kadi inatoka moja kwa moja kwenye
    selectedEvent.card_image_url.
  */
  const response =
    await axios.get(
      selectedEvent.card_image_url,
      {
        responseType:
          "arraybuffer",
        timeout:
          30000
      }
    );

  if (!response.data) {
    throw new Error(
      `Kadi ya Event ${selectedEvent.event_key} haikupatikana.`
    );
  }

  const original =
    Buffer.from(response.data);

  const metadata =
    await sharp(
      original
    ).metadata();

  const width =
    Number(
      metadata.width || 1024
    );

  const height =
    Number(
      metadata.height || 1536
    );

  const qr =
    await QRCode.toBuffer(
      token,
      {
        type: "png",
        width: QR_SIZE,
        margin: 2,
        errorCorrectionLevel:
          "H"
      }
    );

  const scaleX =
    width / 1024;

  const scaleY =
    height / 1536;

  const size =
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

  const x =
    Math.max(
      0,
      Math.round(
        QR_X * scaleX
      )
    );

  const y =
    Math.max(
      0,
      Math.round(
        QR_Y * scaleY
      )
    );

  const finalQR =
    await sharp(qr)
      .resize(
        size,
        size,
        {
          fit: "contain"
        }
      )
      .png()
      .toBuffer();

  const finalCard =
    await sharp(original)
      .composite([{
        input: finalQR,
        left:
          Math.min(
            x,
            Math.max(
              0,
              width - size
            )
          ),
        top:
          Math.min(
            y,
            Math.max(
              0,
              height - size
            )
          )
      }])
      .png()
      .toBuffer();

  const filePath =
    `${safe(selectedEvent.event_key)}/${safe(guestCode)}-${safe(name)}-${token}.png`;

  const uploaded =
    await uploadStorage(
      finalCard,
      "image/png",
      filePath
    );

  return {
    qrToken: token,
    cardImageUrl:
      uploaded.url,
    storagePath:
      uploaded.path,
    eventKey:
      selectedEvent.event_key,
    eventName:
      selectedEvent.event_name,
    eventCardUrl:
      selectedEvent.card_image_url,
    templateName:
      selectedEvent.template_name ||
      DEFAULT_TEMPLATE,
    templateLanguage:
      selectedEvent.template_language ||
      DEFAULT_LANGUAGE
  };
}

/* =========================================================
   GUEST LOOKUP
========================================================= */

async function findGuest(
  key,
  guestCode
) {
  const { data, error } =
    await supabase
      .from("guests")
      .select("*")
      .eq(
        "event_key",
        eventKey(key)
      )
      .eq(
        "guest_code",
        code(guestCode)
      )
      .limit(1)
      .maybeSingle();

  if (error) throw error;

  return data || null;
}

/* =========================================================
   SAVE GUEST
========================================================= */

async function saveGuest({
  name,
  to,
  guestCode,
  key,
  qr,
  card
}) {
  const payload = {
    full_name:
      String(name).trim(),
    phone:
      phone(to),
    guest_code:
      code(guestCode),
    event_key:
      eventKey(key),
    qr_token:
      qr,
    card_image_url:
      card,
    invitation_type:
      invitationType(guestCode),
    attendance_status:
      "pending"
  };

  const { data, error } =
    await supabase
      .from("guests")
      .insert([payload])
      .select()
      .single();

  if (error) {
    if (error.code === "23505") {
      const existing =
        await findGuest(
          key,
          guestCode
        );

      const duplicate =
        new Error(
          `Code ${guestCode} tayari ipo kwenye Event ${key}.`
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
   WHATSAPP TEMPLATE
========================================================= */

async function sendTemplate({
  to,
  name,
  guestCode,
  card,
  template,
  language
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
      phone(to),

    type:
      "template",

    template: {
      name:
        template ||
        DEFAULT_TEMPLATE,

      language: {
        code:
          language ||
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
                  card
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
   SINGLE INVITATION
========================================================= */

app.post(
  "/send-invitation",
  async (req, res) => {
    let prepared = null;

    try {
      const {
        to,
        name,
        code: guestCode,
        event_key
      } = req.body || {};

      if (
        !to ||
        !name ||
        !guestCode ||
        !event_key
      ) {
        return res.status(400).json({
          success: false,
          message:
            "to, name, code na event_key vinahitajika."
        });
      }

      const key =
        eventKey(event_key);

      const cleanCode =
        code(guestCode);

      const selectedEvent =
        await getEvent(key);

      const existing =
        await findGuest(
          key,
          cleanCode
        );

      if (existing) {
        return res.status(409).json({
          success: false,
          duplicate: true,
          message:
            `Code ${cleanCode} tayari ipo kwenye Event ${key}.`,
          guest:
            existing
        });
      }

      prepared =
        await makeGuestCard(
          String(name).trim(),
          cleanCode,
          selectedEvent
        );

      /*
        SECURITY CHECK
      */
      if (
        prepared.eventKey !== key ||
        prepared.eventCardUrl !==
          selectedEvent.card_image_url
      ) {
        throw new Error(
          "Event/Card mismatch imezuiwa."
        );
      }

      const whatsapp =
        await sendTemplate({
          to,
          name:
            String(name).trim(),
          guestCode:
            cleanCode,
          card:
            prepared.cardImageUrl,
          template:
            prepared.templateName,
          language:
            prepared.templateLanguage
        });

      const guest =
        await saveGuest({
          name,
          to,
          guestCode:
            cleanCode,
          key,
          qr:
            prepared.qrToken,
          card:
            prepared.cardImageUrl
        });

      res.json({
        success: true,
        event_key:
          key,
        event_name:
          selectedEvent.event_name,
        card_image_url:
          prepared.cardImageUrl,
        guest,
        result:
          whatsapp
      });
    } catch (e) {
      if (prepared?.storagePath) {
        await deleteStorage(
          prepared.storagePath
        );
      }

      console.error(
        "SEND INVITATION:",
        e.response?.data ||
        e.message
      );

      res.status(
        e.isDuplicate ? 409 : 500
      ).json({
        success: false,
        duplicate:
          Boolean(e.isDuplicate),
        error:
          e.response?.data ||
          e.message,
        message:
          e.message,
        guest:
          e.guest || null
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
        event_key,
        contacts
      } = req.body || {};

      if (!event_key) {
        return res.status(400).json({
          success: false,
          message:
            "event_key inahitajika."
        });
      }

      if (
        !Array.isArray(contacts) ||
        !contacts.length
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Hakuna contacts za kutuma."
        });
      }

      const key =
        eventKey(event_key);

      const selectedEvent =
        await getEvent(key);

      const results = [];

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
          code(
            contact.code || ""
          );

        let prepared = null;

        try {
          /*
            HTML yako hutuma event_key
            kwa kila contact.

            Lazima ilingane na bulk Event.
          */
          if (
            contact.event_key &&
            eventKey(
              contact.event_key
            ) !== key
          ) {
            results.push({
              to,
              name,
              code:
                guestCode,
              event_key:
                contact.event_key,
              success:
                false,
              event_mismatch:
                true,
              error:
                `Event mismatch. Bulk ni ${key}.`
            });

            continue;
          }

          if (
            !phone(to) ||
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

          const existing =
            await findGuest(
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

          prepared =
            await makeGuestCard(
              name,
              guestCode,
              selectedEvent
            );

          /*
            CARD SECURITY
          */
          if (
            prepared.eventKey !== key ||
            prepared.eventCardUrl !==
              selectedEvent.card_image_url
          ) {
            throw new Error(
              "Event/Card mismatch imezuiwa."
            );
          }

          const whatsapp =
            await sendTemplate({
              to,
              name,
              guestCode,
              card:
                prepared.cardImageUrl,
              template:
                prepared.templateName,
              language:
                prepared.templateLanguage
            });

          const guest =
            await saveGuest({
              name,
              to,
              guestCode,
              key,
              qr:
                prepared.qrToken,
              card:
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
              selectedEvent.event_name,
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

          if (
            i <
            contacts.length - 1
          ) {
            await delay(
              BULK_DELAY_MS
            );
          }
        } catch (e) {
          if (prepared?.storagePath) {
            await deleteStorage(
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
              Boolean(e.isDuplicate),
            error:
              e.response?.data ||
              e.message
          });
        }
      }

      const successful =
        results.filter(
          x => x.success
        ).length;

      const failed =
        results.filter(
          x => !x.success
        ).length;

      const duplicates =
        results.filter(
          x => x.duplicate
        ).length;

      const eventMismatches =
        results.filter(
          x => x.event_mismatch
        ).length;

      res.json({
        success:
          true,

        total:
          contacts.length,

        event_key:
          key,

        event_name:
          selectedEvent.event_name,

        card_image_url:
          selectedEvent.card_image_url,

        successful,
        failed,
        duplicates,
        event_mismatches,

        results
      });
    } catch (e) {
      console.error(
        "BULK SEND:",
        e.response?.data ||
        e.message
      );

      res.status(500).json({
        success:
          false,
        error:
          e.response?.data ||
          e.message
      });
    }
  }
);

/* =========================================================
   WHATSAPP ATTENDANCE
========================================================= */

function attendanceStatus(
  id,
  title
) {
  const a =
    String(id || "")
      .toLowerCase()
      .trim();

  const b =
    String(title || "")
      .toLowerCase()
      .trim();

  if (
    a === "nitashiriki" ||
    b === "nitashiriki"
  ) {
    return "confirmed";
  }

  if (
    a === "sitashiriki" ||
    b === "sitashiriki"
  ) {
    return "declined";
  }

  if (
    a === "sina_uhakika" ||
    a === "sinauhakika" ||
    b === "sina uhakika"
  ) {
    return "maybe";
  }

  return null;
}

async function processAttendance(
  from,
  id,
  title
) {
  const status =
    attendanceStatus(
      id,
      title
    );

  if (!status) {
    return;
  }

  const cleanPhone =
    phone(from);

  const { data, error } =
    await supabase
      .from("guests")
      .select(
        "id,full_name,phone,guest_code,event_key"
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
    return;
  }

  const { error: updateError } =
    await supabase
      .from("guests")
      .update({
        attendance_status:
          status
      })
      .eq(
        "id",
        guest.id
      );

  if (updateError) {
    throw updateError;
  }

  let reply =
    "Asante. Tumepokea jibu lako.";

  if (status === "confirmed") {
    reply =
      `Asante ${guest.full_name}. Tumethibitisha kuwa utashiriki. Karibu sana GeitaCard!`;
  }

  if (status === "declined") {
    reply =
      "Asante kwa taarifa yako. Tumepokea kuwa hutashiriki.";
  }

  if (status === "maybe") {
    reply =
      "Asante. Tumepokea kuwa bado huna uhakika.";
  }

  await sendText(
    from,
    reply
  );
}

/* =========================================================
   WHATSAPP TEXT
========================================================= */

async function sendText(
  to,
  text
) {
  if (
    !WHATSAPP_TOKEN ||
    !PHONE_NUMBER_ID
  ) {
    return;
  }

  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;

  return axios.post(
    url,
    {
      messaging_product:
        "whatsapp",
      recipient_type:
        "individual",
      to:
        phone(to),
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

    res.sendStatus(403);
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
        body.entry?.[0]
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
        Old WhatsApp button.
      */
      if (
        message.type ===
        "button"
      ) {
        await processAttendance(
          from,
          message.button?.payload,
          message.button?.text
        );

        return res.sendStatus(
          200
        );
      }

      /*
        Interactive reply button.
      */
      if (
        message.type ===
          "interactive" &&
        message.interactive
          ?.type ===
          "button_reply"
      ) {
        await processAttendance(
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
    } catch (e) {
      console.error(
        "WEBHOOK:",
        e.response?.data ||
        e.message
      );

      /*
        Meta ipate 200 ili
        isirudie webhook mara nyingi.
      */
      return res.sendStatus(
        200
      );
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
        code: guestCode,
        event_key
      } = req.body || {};

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
        eventKey(event_key);

      const cleanCode =
        code(guestCode);

      /*
        EVENT + CODE.
        Hivyo Event A na Event B zimetenganishwa.
      */
      const { data, error } =
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

      if (error) throw error;

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

      if (guest.scanned_at) {
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

      const { data: updated, error: updateError } =
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
    } catch (e) {
      console.error(
        "CODE CHECK-IN:",
        e.message
      );

      res.status(500).json({
        success:
          false,
        message:
          e.message
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

      const { data: guest, error } =
        await supabase
          .from("guests")
          .select("*")
          .eq(
            "qr_token",
            token
          )
          .maybeSingle();

      if (error) throw error;

      if (!guest) {
        return res.status(404).json({
          success:
            false,
          message:
            "QR hii si ya mgeni aliyesajiliwa."
        });
      }

      if (guest.scanned_at) {
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

      const { data: updated, error: updateError } =
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
    } catch (e) {
      console.error(
        "QR CHECK-IN:",
        e.message
      );

      res.status(500).json({
        success:
          false,
        message:
          e.message
      });
    }
  }
);

/* =========================================================
   ATTENDANCE / DASHBOARD
========================================================= */

app.get(
  "/api/attendance",
  async (req, res) => {
    try {
      const { data, error } =
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

      if (error) throw error;

      res.json({
        success:
          true,
        total:
          data?.length || 0,
        guests:
          data || []
      });
    } catch (e) {
      console.error(
        "ATTENDANCE:",
        e.message
      );

      res.status(500).json({
        success:
          false,
        error:
          e.message
      });
    }
  }
);

/* =========================================================
   EXCEL EXPORT
========================================================= */

app.get(
  "/api/attendance/export",
  async (req, res) => {
    try {
      const { data, error } =
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

      if (error) throw error;

      const rows =
        (data || []).map(
          (g, i) => ({
            "#":
              i + 1,

            "Jina":
              g.full_name || "",

            "Simu":
              g.phone || "",

            "Code":
              g.guest_code || "",

            "Event":
              g.event_key || "",

            "Aina":
              g.invitation_type || "",

            "Ushiriki":
              g.attendance_status ===
              "confirmed"
                ? "Nitashiriki"
                : g.attendance_status ===
                  "declined"
                  ? "Sitashiriki"
                  : g.attendance_status ===
                    "maybe"
                    ? "Sina uhakika"
                    : "Pending",

            "Check-in":
              g.scanned_at
                ? "Checked-in"
                : "Hajaingia",

            "QR Token":
              g.qr_token || "",

            "Kadi URL":
              g.card_image_url || "",

            "Muda Check-in":
              g.scanned_at
                ? new Date(
                    g.scanned_at
                  ).toLocaleString(
                    "sw-TZ"
                  )
                : "",

            "Muda Created":
              g.created_at
                ? new Date(
                    g.created_at
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
    } catch (e) {
      console.error(
        "EXPORT:",
        e.message
      );

      res.status(500).json({
        success:
          false,
        error:
          e.message
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
    res.json({
      success:
        true,

      service:
        "GeitaCard",

      event_system:
        "enabled",

      event_card_separation:
        "enabled",

      event_card_upload:
        "enabled",

      excel_csv:
        "enabled",

      bulk_whatsapp:
        "enabled",

      qr_generation:
        "enabled",

      qr_checkin:
        "enabled",

      code_checkin:
        "enabled",

      dashboard:
        "enabled",

      attendance:
        "enabled",

      storage_bucket:
        STORAGE_BUCKET
    });
  }
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
   ERROR HANDLER
========================================================= */

app.use(
  (err, req, res, next) => {
    console.error(
      "SERVER ERROR:",
      err
    );

    if (res.headersSent) {
      return next(err);
    }

    res.status(500).json({
      success:
        false,
      error:
        err.message ||
        "Server error."
    });
  }
);

/* =========================================================
   START
========================================================= */

app.listen(
  PORT,
  () => {
    console.log(
      "=========================================="
    );

    console.log(
      `🚀 GeitaCard running on port ${PORT}`
    );

    console.log(
      "EVENT SYSTEM       : ENABLED"
    );

    console.log(
      "EVENT/CARD SEPARATION: ENABLED"
    );

    console.log(
      "CARD UPLOAD        : ENABLED"
    );

    console.log(
      "EXCEL/CSV           : ENABLED"
    );

    console.log(
      "BULK WHATSAPP      : ENABLED"
    );

    console.log(
      "QR GENERATION      : ENABLED"
    );

    console.log(
      "QR CHECK-IN        : ENABLED"
    );

    console.log(
      "CODE CHECK-IN      : ENABLED"
    );

    console.log(
      "ATTENDANCE         : ENABLED"
    );

    console.log(
      "DASHBOARD          : ENABLED"
    );

    console.log(
      "DEFAULT EVENT      : DISABLED"
    );

    console.log(
      `STORAGE BUCKET     : ${STORAGE_BUCKET}`
    );

    console.log(
      "=========================================="
    );
  }
);
