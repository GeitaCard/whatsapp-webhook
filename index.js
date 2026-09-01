// ============================================================
// GEITACARD - WHATSAPP INVITATION SYSTEM
// EVENT A ONLY
// ============================================================

const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

// ------------------------------------------------------------
// APP
// ------------------------------------------------------------

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 10000;

// ------------------------------------------------------------
// ENVIRONMENT VARIABLES
// ------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID =
  process.env.WHATSAPP_PHONE_NUMBER_ID;

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const INVITE_IMAGE_URL =
  process.env.INVITE_IMAGE_URL || "";

const PUBLIC_URL =
  process.env.PUBLIC_URL || "";

const ADMIN_PHONE_NUMBER_ID =
  process.env.ADMIN_PHONE_NUMBER_ID || "";

// EVENT A ONLY
const EVENT_KEY = "EVENT_A";

// ------------------------------------------------------------
// CHECK CONFIGURATION
// ------------------------------------------------------------

console.log("==============================================");
console.log("🚀 GeitaCard Server inaanza...");
console.log("==============================================");

console.log("📌 EVENT:", EVENT_KEY);
console.log("📌 PORT:", PORT);
console.log("📌 SUPABASE_URL:", SUPABASE_URL ? "SET" : "MISSING");
console.log(
  "📌 SUPABASE_SERVICE_ROLE_KEY:",
  SUPABASE_SERVICE_ROLE_KEY ? "SET" : "MISSING"
);
console.log(
  "📌 WHATSAPP_TOKEN:",
  WHATSAPP_TOKEN ? "SET" : "MISSING"
);
console.log(
  "📌 WHATSAPP_PHONE_NUMBER_ID:",
  WHATSAPP_PHONE_NUMBER_ID ? "SET" : "MISSING"
);
console.log(
  "📌 VERIFY_TOKEN:",
  VERIFY_TOKEN ? "SET" : "MISSING"
);
console.log(
  "📌 INVITE_IMAGE_URL:",
  INVITE_IMAGE_URL ? "SET" : "MISSING"
);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "❌ SUPABASE_URL au SUPABASE_SERVICE_ROLE_KEY haijawekwa."
  );
}

// ------------------------------------------------------------
// SUPABASE
// ------------------------------------------------------------

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      )
    : null;

// ------------------------------------------------------------
// MULTER - EXCEL UPLOAD
// ------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function normalizePhone(phone) {
  if (phone === undefined || phone === null) {
    return "";
  }

  let value = String(phone).trim();

  // Ondoa spaces, -, brackets
  value = value.replace(/[\s\-().]/g, "");

  // Tanzania:
  // 0740123456 -> 255740123456
  // 740123456 -> 255740123456
  // +255740123456 -> 255740123456
  if (value.startsWith("+")) {
    value = value.substring(1);
  }

  if (value.startsWith("00")) {
    value = value.substring(2);
  }

  if (value.startsWith("0") && value.length === 10) {
    value = "255" + value.substring(1);
  }

  if (value.length === 9 && value.startsWith("7")) {
    value = "255" + value;
  }

  return value;
}

function cleanName(name) {
  if (name === undefined || name === null) {
    return "";
  }

  return String(name).trim();
}

function generateGuestCode() {
  const random = crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase();

  return `A-${random}`;
}

function generateQRToken() {
  return crypto.randomBytes(24).toString("hex");
}

function getBaseUrl(req) {
  if (PUBLIC_URL) {
    return PUBLIC_URL.replace(/\/$/, "");
  }

  const protocol =
    req.headers["x-forwarded-proto"] ||
    req.protocol ||
    "https";

  const host =
    req.headers["x-forwarded-host"] ||
    req.get("host");

  return `${protocol}://${host}`;
}

// ------------------------------------------------------------
// GET HOME
// ------------------------------------------------------------

app.get("/", async (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="sw">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>GeitaCard WhatsApp System</title>

<style>
body{
  font-family:Arial,Helvetica,sans-serif;
  background:#f5f7fb;
  margin:0;
  padding:30px;
  color:#172033;
}

.container{
  max-width:900px;
  margin:auto;
}

.card{
  background:#fff;
  padding:25px;
  border-radius:15px;
  margin-bottom:20px;
  box-shadow:0 4px 20px rgba(0,0,0,.08);
}

h1{
  margin-top:0;
}

.badge{
  display:inline-block;
  background:#e8f5e9;
  color:#188038;
  padding:7px 12px;
  border-radius:20px;
  font-weight:bold;
}

.status{
  margin-top:15px;
  line-height:1.8;
}

a{
  color:#1769aa;
}
</style>
</head>

<body>

<div class="container">

<div class="card">

<h1>🎫 GeitaCard</h1>

<div class="badge">
EVENT_A ACTIVE
</div>

<div class="status">

<p>WhatsApp Invitation System</p>

<p>
<strong>Event:</strong> EVENT_A
</p>

<p>
<strong>Database:</strong>
${supabase ? "CONNECTED" : "NOT CONNECTED"}
</p>

<p>
<strong>WhatsApp:</strong>
${WHATSAPP_TOKEN ? "CONFIGURED" : "NOT CONFIGURED"}
</p>

</div>

</div>

</div>

</body>
</html>
`);
});

// ------------------------------------------------------------
// HEALTH CHECK
// ------------------------------------------------------------

app.get("/health", (req, res) => {
  res.json({
    success: true,
    system: "GeitaCard",
    event: EVENT_KEY,
    status: "online",
    supabase: !!supabase,
    whatsapp: !!WHATSAPP_TOKEN,
    time: new Date().toISOString(),
  });
});

// ------------------------------------------------------------
// GET EVENT A
// ------------------------------------------------------------

app.get("/api/event", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: "Supabase haija-configure.",
      });
    }

    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("event_key", EVENT_KEY)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "EVENT_A haipo kwenye database.",
      });
    }

    res.json({
      success: true,
      event: data,
    });

  } catch (error) {
    console.error("❌ GET EVENT ERROR:", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ------------------------------------------------------------
// SET / UPDATE EVENT A CARD IMAGE
// ------------------------------------------------------------

app.post("/api/event/card", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: "Supabase haija-configure.",
      });
    }

    const { card_image_url } = req.body;

    if (!card_image_url) {
      return res.status(400).json({
        success: false,
        error: "card_image_url inahitajika.",
      });
    }

    const { data, error } = await supabase
      .from("events")
      .update({
        card_image_url,
        updated_at: new Date().toISOString(),
      })
      .eq("event_key", EVENT_KEY)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      event: data,
    });

  } catch (error) {
    console.error("❌ CARD UPDATE ERROR:", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ------------------------------------------------------------
// UPLOAD EXCEL
// ------------------------------------------------------------

app.post(
  "/api/guests/upload",
  upload.single("file"),
  async (req, res) => {

    try {

      if (!supabase) {
        return res.status(500).json({
          success: false,
          error: "Supabase haija-configure.",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "Tafadhali upload Excel file.",
        });
      }

      console.log(
        `📥 Excel imepokelewa: ${req.file.originalname}`
      );

      // ------------------------------------------------------
      // GET EVENT A
      // ------------------------------------------------------

      const { data: event, error: eventError } =
        await supabase
          .from("events")
          .select("*")
          .eq("event_key", EVENT_KEY)
          .eq("is_active", true)
          .maybeSingle();

      if (eventError) {
        throw eventError;
      }

      if (!event) {
        return res.status(404).json({
          success: false,
          error: "EVENT_A haipo au haija-activate.",
        });
      }

      // ------------------------------------------------------
      // READ EXCEL
      // ------------------------------------------------------

      const workbook = XLSX.read(
        req.file.buffer,
        {
          type: "buffer",
          cellDates: true,
        }
      );

      const sheetName = workbook.SheetNames[0];

      if (!sheetName) {
        return res.status(400).json({
          success: false,
          error: "Excel haina worksheet.",
        });
      }

      const worksheet =
        workbook.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json(
        worksheet,
        {
          defval: "",
        }
      );

      if (!rows.length) {
        return res.status(400).json({
          success: false,
          error: "Excel haina wageni.",
        });
      }

      console.log(
        `👥 Wageni waliopatikana: ${rows.length}`
      );

      // ------------------------------------------------------
      // ACCEPT COMMON COLUMN NAMES
      // ------------------------------------------------------

      const getValue = (row, names) => {

        for (const name of names) {

          if (
            Object.prototype.hasOwnProperty.call(
              row,
              name
            )
          ) {
            return row[name];
          }

        }

        // Case-insensitive fallback
        const keys = Object.keys(row);

        for (const key of keys) {

          const normalizedKey =
            key
              .toLowerCase()
              .trim()
              .replace(/\s+/g, "_");

          for (const name of names) {

            if (
              normalizedKey ===
              name.toLowerCase()
            ) {
              return row[key];
            }

          }
        }

        return "";
      };

      // ------------------------------------------------------
      // PREPARE GUESTS
      // ------------------------------------------------------

      const guests = [];
      const errors = [];

      const seenPhones = new Set();

      for (let i = 0; i < rows.length; i++) {

        const row = rows[i];

        const fullName = cleanName(
          getValue(row, [
            "full_name",
            "fullname",
            "name",
            "jina",
            "jina_la_mgeni",
            "guest_name",
          ])
        );

        const rawPhone = getValue(
          row,
          [
            "phone",
            "phone_number",
            "number",
            "simu",
            "namba",
            "whatsapp",
          ]
        );

        const phone = normalizePhone(
          rawPhone
        );

        const excelGuestCode =
          cleanName(
            getValue(row, [
              "guest_code",
              "code",
              "guestcode",
              "code_ya_mgeni",
            ])
          );

        if (!fullName) {
          errors.push({
            row: i + 2,
            error: "Jina halipo.",
          });

          continue;
        }

        if (!phone) {
          errors.push({
            row: i + 2,
            name: fullName,
            error: "Namba ya simu haipo.",
          });

          continue;
        }

        if (!/^255\d{9}$/.test(phone)) {

          errors.push({
            row: i + 2,
            name: fullName,
            phone,
            error:
              "Namba si sahihi. Mfano: 255740267204",
          });

          continue;
        }

        // Zuia duplicate ndani ya Excel moja
        if (seenPhones.has(phone)) {

          errors.push({
            row: i + 2,
            name: fullName,
            phone,
            error:
              "Namba hii imerudiwa kwenye Excel.",
          });

          continue;
        }

        seenPhones.add(phone);

        const guestCode =
          excelGuestCode ||
          generateGuestCode();

        const qrToken =
          generateQRToken();

        guests.push({
          event_id: event.id,
          event_key: EVENT_KEY,
          full_name: fullName,
          phone,
          guest_code: guestCode,
          qr_token: qrToken,
          attendance_status: null,
          scanned_at: null,
          whatsapp_sent_at: null,
          whatsapp_message_id: null,
        });
      }

      if (!guests.length) {

        return res.status(400).json({
          success: false,
          error:
            "Hakuna mgeni sahihi aliyepatikana kwenye Excel.",
          errors,
        });

      }

      // ------------------------------------------------------
      // INSERT INTO SUPABASE
      // ------------------------------------------------------

      const { data: insertedGuests, error } =
        await supabase
          .from("guests")
          .insert(guests)
          .select();

      if (error) {
        throw error;
      }

      console.log(
        `✅ Wageni ${insertedGuests.length} wamehifadhiwa.`
      );

      // ------------------------------------------------------
      // ADD QR URL
      // ------------------------------------------------------

      const baseUrl =
        getBaseUrl(req);

      const result =
        insertedGuests.map((guest) => {

          return {
            id: guest.id,
            name: guest.full_name,
            phone: guest.phone,
            guest_code: guest.guest_code,
            qr_token: guest.qr_token,

            qr_url:
              `${baseUrl}/qr/${guest.qr_token}`,

            attendance_status:
              guest.attendance_status,

            whatsapp_sent:
              !!guest.whatsapp_sent_at,
          };

        });

      res.json({

        success: true,

        event: {
          key: EVENT_KEY,
          id: event.id,
          name: event.event_name,
        },

        imported:
          insertedGuests.length,

        skipped:
          errors.length,

        guests: result,

        errors,

      });

    } catch (error) {

      console.error(
        "❌ EXCEL UPLOAD ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        error: error.message,
      });

    }

  }
);

// ------------------------------------------------------------
// GET GUESTS
// ------------------------------------------------------------

app.get("/api/guests", async (req, res) => {

  try {

    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: "Supabase haija-configure.",
      });
    }

    const { data, error } =
      await supabase
        .from("guests")
        .select(`
          id,
          event_id,
          event_key,
          full_name,
          phone,
          guest_code,
          qr_token,
          attendance_status,
          scanned_at,
          whatsapp_sent_at,
          whatsapp_message_id,
          created_at,
          updated_at
        `)
        .eq("event_key", EVENT_KEY)
        .order("created_at", {
          ascending: false,
        });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      event: EVENT_KEY,
      count: data.length,
      guests: data,
    });

  } catch (error) {

    console.error(
      "❌ GET GUESTS ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      error: error.message,
    });

  }

});

// ------------------------------------------------------------
// GET SINGLE GUEST
// ------------------------------------------------------------

app.get("/api/guest/:id", async (req, res) => {

  try {

    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: "Supabase haija-configure.",
      });
    }

    const { data, error } =
      await supabase
        .from("guests")
        .select("*")
        .eq("id", req.params.id)
        .eq("event_key", EVENT_KEY)
        .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "Mgeni hajapatikana.",
      });
    }

    res.json({
      success: true,
      guest: data,
    });

  } catch (error) {

    console.error(
      "❌ GET GUEST ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      error: error.message,
    });

  }

});

// ------------------------------------------------------------
// QR PAGE
// ------------------------------------------------------------

app.get("/qr/:token", async (req, res) => {

  try {

    if (!supabase) {
      return res.status(500).send(
        "Database haija-configure."
      );
    }

    const { data: guest, error } =
      await supabase
        .from("guests")
        .select("*")
        .eq("qr_token", req.params.token)
        .eq("event_key", EVENT_KEY)
        .maybeSingle();

    if (error) {
      throw error;
    }

    if (!guest) {
      return res.status(404).send(`
        <h2>QR Code si sahihi</h2>
        <p>Mgeni hajapatikana.</p>
      `);
    }

    res.send(`
<!DOCTYPE html>
<html lang="sw">

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width, initial-scale=1.0"
>

<title>Kadi ya Mwaliko</title>

<style>

body{
  margin:0;
  padding:20px;
  background:#f5f5f5;
  font-family:Arial,sans-serif;
}

.card{
  max-width:500px;
  margin:auto;
  background:white;
  border-radius:18px;
  padding:20px;
  box-shadow:0 4px 20px rgba(0,0,0,.15);
}

img{
  max-width:100%;
  border-radius:12px;
}

h2{
  margin-bottom:5px;
}

.code{
  font-weight:bold;
  font-size:20px;
}

.status{
  margin-top:20px;
  padding:15px;
  border-radius:10px;
  background:#f0f4f8;
}

</style>

</head>

<body>

<div class="card">

${
  INVITE_IMAGE_URL
    ? `<img src="${INVITE_IMAGE_URL}" alt="Kadi ya Mwaliko">`
    : ""
}

<h2>KADI YA MWALIKO</h2>

<p>
<strong>${guest.full_name}</strong>
</p>

<p class="code">
Code: ${guest.guest_code}
</p>

<div class="status">

<strong>EVENT A</strong>

<p>
Hii ni QR Code yako binafsi.
</p>

<p>
Attendance:
${
  guest.attendance_status ||
  "Haijathibitishwa"
}
</p>

</div>

</div>

</body>

</html>
`);

  } catch (error) {

    console.error(
      "❌ QR ERROR:",
      error
    );

    res.status(500).send(
      "Hitilafu ya mfumo."
    );

  }

});

// ------------------------------------------------------------
// WHATSAPP SEND FUNCTION
// ------------------------------------------------------------

async function sendWhatsAppInvitation(
  guest,
  event,
  req
) {

  if (
    !WHATSAPP_TOKEN ||
    !WHATSAPP_PHONE_NUMBER_ID
  ) {

    throw new Error(
      "WHATSAPP_TOKEN au WHATSAPP_PHONE_NUMBER_ID haijawekwa."
    );

  }

  const imageUrl =
    event.card_image_url ||
    INVITE_IMAGE_URL;

  const baseUrl =
    getBaseUrl(req);

  const qrUrl =
    `${baseUrl}/qr/${guest.qr_token}`;

  const bodyText =
`Code: ${guest.guest_code}

Tafadhali Azizi ${guest.full_name}, kumbuka kufika na kadi hii ukumbini.
Karibu sana.

Tafadhali thibitisha ushiriki wako kwa kuchagua moja ya options hapa chini.`;

  // ----------------------------------------------------------
  // WHATSAPP INTERACTIVE MESSAGE
  // ----------------------------------------------------------

  const payload = {

    messaging_product: "whatsapp",

    recipient_type: "individual",

    to: guest.phone,

    type: "interactive",

    interactive: {

      type: "button",

      header: imageUrl
        ? {
            type: "image",
            image: {
              link: imageUrl,
            },
          }
        : undefined,

      body: {
        text: bodyText,
      },

      footer: {
        text: "GeitaCard",
      },

      action: {

        buttons: [

          {
            type: "reply",
            reply: {
              id: `ATTEND_YES_${guest.id}`,
              title: "Nitashiriki",
            },
          },

          {
            type: "reply",
            reply: {
              id: `ATTEND_MAYBE_${guest.id}`,
              title: "Sina uhakika",
            },
          },

          {
            type: "reply",
            reply: {
              id: `ATTEND_NO_${guest.id}`,
              title: "Sitashiriki",
            },
          },

        ],

      },

    },

  };

  // Kama hakuna image URL,
  // ondoa header kabisa
  if (!imageUrl) {
    delete payload.interactive.header;
  }

  // ----------------------------------------------------------
  // SEND TO META
  // ----------------------------------------------------------

  const response =
    await fetch(
      `https://graph.facebook.com/v23.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {

        method: "POST",

        headers: {

          Authorization:
            `Bearer ${WHATSAPP_TOKEN}`,

          "Content-Type":
            "application/json",

        },

        body:
          JSON.stringify(payload),

      }
    );

  const result =
    await response.json();

  if (!response.ok) {

    console.error(
      "❌ WhatsApp API ERROR:",
      JSON.stringify(
        result,
        null,
        2
      )
    );

    throw new Error(
      result?.error?.message ||
      "WhatsApp API imekataa ujumbe."
    );

  }

  const messageId =
    result?.messages?.[0]?.id ||
    null;

  // ----------------------------------------------------------
  // SAVE SENT STATUS
  // ----------------------------------------------------------

  await supabase
    .from("guests")
    .update({
      whatsapp_sent_at:
        new Date().toISOString(),

      whatsapp_message_id:
        messageId,

      updated_at:
        new Date().toISOString(),
    })
    .eq("id", guest.id);

  return {
    success: true,
    message_id: messageId,
    qr_url: qrUrl,
  };

}

// ------------------------------------------------------------
// SEND ONE INVITATION
// ------------------------------------------------------------

app.post(
  "/api/send/:guestId",
  async (req, res) => {

    try {

      if (!supabase) {
        return res.status(500).json({
          success: false,
          error: "Supabase haija-configure.",
        });
      }

      const { data: guest, error: guestError } =
        await supabase
          .from("guests")
          .select("*")
          .eq("id", req.params.guestId)
          .eq("event_key", EVENT_KEY)
          .maybeSingle();

      if (guestError) {
        throw guestError;
      }

      if (!guest) {
        return res.status(404).json({
          success: false,
          error: "Mgeni hajapatikana.",
        });
      }

      const { data: event, error: eventError } =
        await supabase
          .from("events")
          .select("*")
          .eq("event_key", EVENT_KEY)
          .eq("is_active", true)
          .maybeSingle();

      if (eventError) {
        throw eventError;
      }

      if (!event) {
        return res.status(404).json({
          success: false,
          error: "EVENT_A haipo au haija-activate.",
        });
      }

      const result =
        await sendWhatsAppInvitation(
          guest,
          event,
          req
        );

      res.json({
        success: true,
        event: EVENT_KEY,
        guest: {
          id: guest.id,
          name: guest.full_name,
          phone: guest.phone,
          guest_code: guest.guest_code,
        },
        result,
      });

    } catch (error) {

      console.error(
        "❌ SEND ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        error: error.message,
      });

    }

  }
);

// ------------------------------------------------------------
// SEND ALL UNSENT INVITATIONS
// ------------------------------------------------------------

app.post(
  "/api/send-all",
  async (req, res) => {

    try {

      if (!supabase) {
        return res.status(500).json({
          success: false,
          error: "Supabase haija-configure.",
        });
      }

      const { data: event, error: eventError } =
        await supabase
          .from("events")
          .select("*")
          .eq("event_key", EVENT_KEY)
          .eq("is_active", true)
          .maybeSingle();

      if (eventError) {
        throw eventError;
      }

      if (!event) {
        return res.status(404).json({
          success: false,
          error: "EVENT_A haipo au haija-activate.",
        });
      }

      const { data: guests, error } =
        await supabase
          .from("guests")
          .select("*")
          .eq("event_key", EVENT_KEY)
          .is("whatsapp_sent_at", null)
          .order("created_at", {
            ascending: true,
          });

      if (error) {
        throw error;
      }

      if (!guests.length) {

        return res.json({
          success: true,
          message:
            "Hakuna wageni ambao bado hawajatumwa.",
          total: 0,
          sent: 0,
          failed: 0,
        });

      }

      console.log(
        `📤 Tunaanza kutuma wageni ${guests.length}...`
      );

      const results = [];

      let sent = 0;
      let failed = 0;

      for (const guest of guests) {

        try {

          console.log(
            `📨 Inatuma: ${guest.full_name} - ${guest.phone}`
          );

          const result =
            await sendWhatsAppInvitation(
              guest,
              event,
              req
            );

          sent++;

          results.push({
            id: guest.id,
            name: guest.full_name,
            phone: guest.phone,
            success: true,
            message_id:
              result.message_id,
          });

          // Delay kidogo kati ya messages
          await new Promise(
            (resolve) =>
              setTimeout(resolve, 1200)
          );

        } catch (error) {

          failed++;

          results.push({
            id: guest.id,
            name: guest.full_name,
            phone: guest.phone,
            success: false,
            error: error.message,
          });

        }

      }

      console.log(
        `✅ SEND ALL COMPLETE: sent=${sent}, failed=${failed}`
      );

      res.json({

        success: true,

        event: EVENT_KEY,

        total: guests.length,

        sent,

        failed,

        results,

      });

    } catch (error) {

      console.error(
        "❌ SEND ALL ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        error: error.message,
      });

    }

  }
);

// ------------------------------------------------------------
// WHATSAPP WEBHOOK VERIFY
// ------------------------------------------------------------

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

      console.log(
        "✅ WhatsApp webhook verified."
      );

      return res
        .status(200)
        .send(challenge);

    }

    console.log(
      "❌ WhatsApp webhook verification failed."
    );

    return res
      .sendStatus(403);

  }
);

// ------------------------------------------------------------
// WHATSAPP WEBHOOK RECEIVE
// ------------------------------------------------------------

app.post(
  "/webhook",
  async (req, res) => {

    // WhatsApp inahitaji 200 haraka
    res.sendStatus(200);

    try {

      console.log(
        "📩 WhatsApp webhook received"
      );

      const body =
        req.body;

      if (
        body.object !== "whatsapp_business_account"
      ) {
        return;
      }

      const entries =
        body.entry || [];

      for (const entry of entries) {

        const changes =
          entry.changes || [];

        for (const change of changes) {

          const value =
            change.value || {};

          const messages =
            value.messages || [];

          for (const message of messages) {

            await processIncomingWhatsAppMessage(
              message
            );

          }

        }

      }

    } catch (error) {

      console.error(
        "❌ WEBHOOK PROCESS ERROR:",
        error
      );

    }

  }
);

// ------------------------------------------------------------
// PROCESS WHATSAPP RESPONSE
// ------------------------------------------------------------

async function processIncomingWhatsAppMessage(
  message
) {

  if (!supabase) {
    return;
  }

  // ----------------------------------------------------------
  // BUTTON REPLY
  // ----------------------------------------------------------

  let response = null;

  if (
    message.type === "interactive" &&
    message.interactive
  ) {

    const interactive =
      message.interactive;

    if (
      interactive.type ===
      "button_reply"
    ) {

      const button =
        interactive.button_reply;

      const buttonId =
        button.id || "";

      if (
        buttonId.startsWith(
          "ATTEND_YES_"
        )
      ) {
        response = "Nitashiriki";
      }

      else if (
        buttonId.startsWith(
          "ATTEND_MAYBE_"
        )
      ) {
        response = "Sina uhakika";
      }

      else if (
        buttonId.startsWith(
          "ATTEND_NO_"
        )
      ) {
        response = "Sitashiriki";
      }

    }

  }

  // ----------------------------------------------------------
  // SIMPLE TEXT RESPONSE
  // ----------------------------------------------------------

  if (
    !response &&
    message.type === "text"
  ) {

    const text =
      (
        message.text?.body ||
        ""
      )
        .trim()
        .toLowerCase();

    if (
      text.includes(
        "nitashiriki"
      )
    ) {
      response = "Nitashiriki";
    }

    else if (
      text.includes(
        "sina uhakika"
      )
    ) {
      response = "Sina uhakika";
    }

    else if (
      text.includes(
        "sitashiriki"
      )
    ) {
      response = "Sitashiriki";
    }

  }

  if (!response) {

    console.log(
      "ℹ️ Ujumbe hauna response ya attendance."
    );

    return;
  }

  const phone =
    normalizePhone(
      message.from
    );

  console.log(
    `📝 Response: ${phone} -> ${response}`
  );

  // ----------------------------------------------------------
  // FIND GUEST BY PHONE
  // ----------------------------------------------------------

  const { data: guest, error } =
    await supabase
      .from("guests")
      .select("*")
      .eq("phone", phone)
      .eq("event_key", EVENT_KEY)
      .maybeSingle();

  if (error) {

    console.error(
      "❌ Guest lookup error:",
      error
    );

    return;
  }

  if (!guest) {

    console.log(
      `⚠️ Hakuna guest mwenye namba ${phone}`
    );

    return;
  }

  // ----------------------------------------------------------
  // UPDATE ATTENDANCE STATUS
  // ----------------------------------------------------------

  const { error: updateError } =
    await supabase
      .from("guests")
      .update({
        attendance_status:
          response,

        updated_at:
          new Date().toISOString(),
      })
      .eq("id", guest.id);

  if (updateError) {

    console.error(
      "❌ Attendance update error:",
      updateError
    );

    return;
  }

  // ----------------------------------------------------------
  // SAVE RESPONSE
  // ----------------------------------------------------------

  const { error: responseError } =
    await supabase
      .from("guest_responses")
      .insert({
        guest_id: guest.id,
        response,
        whatsapp_message_id:
          message.id || null,
      });

  if (responseError) {

    console.error(
      "❌ Response insert error:",
      responseError
    );

    return;
  }

  console.log(
    `✅ Response imehifadhiwa: ${guest.full_name} = ${response}`
  );

  // ----------------------------------------------------------
  // SEND AUTOMATIC REPLY
  // ----------------------------------------------------------

  await sendConfirmationReply(
    phone,
    response
  );

}

// ------------------------------------------------------------
// AUTOMATIC CONFIRMATION
// ------------------------------------------------------------

async function sendConfirmationReply(
  phone,
  response
) {

  if (
    !WHATSAPP_TOKEN ||
    !WHATSAPP_PHONE_NUMBER_ID
  ) {
    return;
  }

  let text =
    "Asante kwa jibu lako. Karibu sana GeitaCard!";

  if (
    response ===
    "Nitashiriki"
  ) {

    text =
      "Asante kwa jibu lako. Karibu sana GeitaCard! Tunafurahi kuthibitisha kuwa utashiriki.";

  }

  else if (
    response ===
    "Sina uhakika"
  ) {

    text =
      "Asante kwa jibu lako. Karibu sana GeitaCard! Tumehifadhi kuwa bado una uhakika kidogo kuhusu ushiriki wako.";

  }

  else if (
    response ===
    "Sitashiriki"
  ) {

    text =
      "Asante kwa kutujibu. Tumehifadhi taarifa yako. Karibu tena GeitaCard!";

  }

  const payload = {

    messaging_product:
      "whatsapp",

    recipient_type:
      "individual",

    to: phone,

    type: "text",

    text: {
      preview_url: false,
      body: text,
    },

  };

  try {

    const responseApi =
      await fetch(
        `https://graph.facebook.com/v23.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {

          method: "POST",

          headers: {

            Authorization:
              `Bearer ${WHATSAPP_TOKEN}`,

            "Content-Type":
              "application/json",

          },

          body:
            JSON.stringify(payload),

        }
      );

    const result =
      await responseApi.json();

    if (!responseApi.ok) {

      console.error(
        "❌ Confirmation WhatsApp error:",
        result
      );

    }

  } catch (error) {

    console.error(
      "❌ Confirmation send error:",
      error
    );

  }

}

// ------------------------------------------------------------
// START SERVER
// ------------------------------------------------------------

app.listen(
  PORT,
  () => {

    console.log("");
    console.log(
      "=============================================="
    );

    console.log(
      "🎉 GeitaCard Server iko LIVE"
    );

    console.log(
      "📌 EVENT: EVENT_A"
    );

    console.log(
      `📌 PORT: ${PORT}`
    );

    console.log(
      `📌 Supabase: ${
        supabase
          ? "CONNECTED"
          : "MISSING"
      }`
    );

    console.log(
      `📌 WhatsApp: ${
        WHATSAPP_TOKEN
          ? "CONFIGURED"
          : "MISSING"
      }`
    );

    console.log(
      "=============================================="
    );

  }
);
