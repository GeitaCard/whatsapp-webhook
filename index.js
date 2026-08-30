const express = require("express");
const axios = require("axios");
const XLSX = require("xlsx");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

/* =========================================================
   SUPABASE
========================================================= */

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
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
   SAVE GUEST
========================================================= */

async function saveGuest(
  to,
  name,
  code
) {

  const phone =
    normalizePhone(to);


  /*
    QR token inaweza kubaki kwenye database
    kwa matumizi ya baadaye.

    Lakini CHECK-IN ya sasa inatumia
    guest_code moja kwa moja.
  */

  const qrToken =
    crypto.randomUUID();


  const invitationType =
    code
      .toUpperCase()
      .endsWith("-KAMATI")
      ? "KAMATI"
      : code
          .toUpperCase()
          .endsWith("-SINGLE")
        ? "SINGLE"
        : (
            process.env.INVITATION_TYPE ||
            "premium"
          );


  /*
    SAVE GUEST
  */

  const {
    data,
    error
  } = await supabase

    .from("guests")

    .insert([
      {

        full_name:
          name,

        phone:
          phone,

        guest_code:
          code,

        qr_token:
          qrToken,

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
  code
) {

  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;


  const components = [];


  /* -------------------------------------------------------
     HEADER IMAGE
  ------------------------------------------------------- */

  if (
    INVITE_IMAGE_URL
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
              INVITE_IMAGE_URL

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
          String(name)

      },

      {

        type:
          "text",

        /*
          CODE INATUMWA EXACTLY
          KAMA ILIVYO.
        */

        text:
          String(code)

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
            normalizePhone(to),

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
  status
) {

  const normalizedPhone =
    normalizePhone(phone);


  const {
    data: guest,
    error: findError
  } = await supabase

    .from("guests")

    .select(
      "id, full_name, phone, guest_code"
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
    status
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


      /* ---------------------------------------------------
         BASIC CHECK
      --------------------------------------------------- */

      if (
        body.object !==
          "whatsapp_business_account" ||
        !body.entry ||
        !body.entry[0]
      ) {

        return res.sendStatus(200);

      }


      const changes =
        body.entry[0].changes;


      if (
        !changes ||
        !changes[0]
      ) {

        return res.sendStatus(200);

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


        return res.sendStatus(200);

      }


      /* ---------------------------------------------------
         MESSAGE
      --------------------------------------------------- */

      if (
        !value.messages ||
        !value.messages[0]
      ) {

        return res.sendStatus(200);

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


        return res.sendStatus(200);

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


        return res.sendStatus(200);

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


        return res.sendStatus(200);

      }


      /* ---------------------------------------------------
         OTHER MESSAGE TYPES
      --------------------------------------------------- */

      console.log(
        "Unhandled message type:",
        message.type
      );


      return res.sendStatus(200);


    } catch (error) {

      console.error(
        "Webhook error:",
        error.response?.data ||
        error.message
      );


      /*
        WhatsApp inahitaji webhook response
        isirudishe error loop.
      */

      return res.sendStatus(200);

    }

  }
);


/* =========================================================
   SEND SINGLE INVITATION
========================================================= */

app.post(
  "/send-invitation",
  async (req, res) => {

    try {

      const {
        to,
        name,
        code
      } = req.body;


      if (
        !to ||
        !name ||
        !code
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "to, name na code vinahitajika."

        });

      }


      /*
        CODE INABAKI EXACTLY
        KAMA ILIVYOTUMWA.
      */

      const cleanTo =
        String(to).trim();

      const cleanName =
        String(name).trim();

      const cleanCode =
        String(code).trim();


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
        "=============================================="
      );


      /* SEND WHATSAPP FIRST */

      const result =
        await sendInvitation(
          cleanTo,
          cleanName,
          cleanCode
        );


      /* SAVE ONLY IF WHATSAPP SENT */

      const guest =
        await saveGuest(
          cleanTo,
          cleanName,
          cleanCode
        );


      return res.status(200).json({

        success:
          true,

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


      return res.status(500).json({

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

        return res.status(400).json({

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

        return res.status(400).json({

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


        /*
          MUHIMU SANA:

          CODE HII HAPA
          HAITENGENEZWI.

          INACHUKULIWA MOJA KWA MOJA
          KUTOKA EXCEL/CSV.
        */

        const code =
          contact.code
            ? String(
                contact.code
              ).trim()
            : "";


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

            success:
              false,

            error:
              "Namba, Jina na Code vinahitajika."

          });


          continue;

        }


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


          /* ---------------------------------------------
             1. SEND WHATSAPP
          --------------------------------------------- */

          const whatsappResult =
            await sendInvitation(
              to,
              name,
              code
            );


          /* ---------------------------------------------
             2. SAVE TO SUPABASE
          --------------------------------------------- */

          const guest =
            await saveGuest(
              to,
              name,
              code
            );


          /* ---------------------------------------------
             3. RESULT
          --------------------------------------------- */

          results.push({

            to:
              to,

            name:
              name,

            code:
              code,

            success:
              true,

            guest:
              guest,

            result:
              whatsappResult

          });


          console.log(
            "SUCCESS:",
            name,
            code
          );


        } catch (error) {

          console.error(
            "Bulk item error:",
            error.response?.data ||
            error.message
          );


          results.push({

            to:
              to,

            name:
              name,

            code:
              code,

            success:
              false,

            error:
              error.response?.data ||
              error.message

          });

        }


        /*
          Pause kati ya message.

          Tunatumia sekunde 1 hapa.
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


      return res.status(200).json({

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


      return res.status(500).json({

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


        return res.status(500).json({

          success:
            false,

          error:
            error.message

        });

      }


      return res.status(200).json({

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


      return res.status(500).json({

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


      /* ---------------------------------------------------
         GET GUESTS
      --------------------------------------------------- */

      const {
        data,
        error
      } = await supabase

        .from("guests")

        .select(
          "full_name, phone, guest_code, invitation_type, attendance_status, scanned_at, created_at"
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


        return res.status(500).json({

          success:
            false,

          error:
            error.message

        });

      }


      /* ---------------------------------------------------
         CONVERT DATA
      --------------------------------------------------- */

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


      /* ---------------------------------------------------
         CREATE WORKSHEET
      --------------------------------------------------- */

      const worksheet =
        XLSX.utils.json_to_sheet(
          rows
        );


      /* ---------------------------------------------------
         COLUMN WIDTHS
      --------------------------------------------------- */

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
        },

        {
          wch:
            25
        }

      ];


      /* ---------------------------------------------------
         CREATE WORKBOOK
      --------------------------------------------------- */

      const workbook =
        XLSX.utils.book_new();


      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "Wahudhuriaji"
      );


      /* ---------------------------------------------------
         WRITE EXCEL
      --------------------------------------------------- */

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


      /* ---------------------------------------------------
         SEND FILE
      --------------------------------------------------- */

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


      return res.status(500).json({

        success:
          false,

        error:
          error.message

      });

    }

  }
);


/* =========================================================
   CHECK-IN GUEST API
========================================================= */

app.post(
  "/api/check-in",
  async (req, res) => {

    try {

      const {
        code
      } = req.body;


      /* ---------------------------------------------------
         VALIDATION
      --------------------------------------------------- */

      if (
        !code
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "Code ya mgeni inahitajika."

        });

      }


      /*
        Code ya CHECK-IN
        inatumika kama ilivyo.

        Tunatoa spaces za mwanzo/mwisho tu.
      */

      const guestCode =
        String(
          code
        ).trim();


      console.log(
        "CHECK-IN CODE:",
        guestCode
      );


      /* ---------------------------------------------------
         SEARCH GUEST BY CODE
      --------------------------------------------------- */

      const {
        data: guest,
        error: findError
      } = await supabase

        .from("guests")

        .select("*")

        .eq(
          "guest_code",
          guestCode
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


      if (findError) {

        console.error(
          "Check-in search error:",
          findError.message
        );


        return res.status(500).json({

          success:
            false,

          message:
            findError.message

        });

      }


      /* ---------------------------------------------------
         GUEST NOT FOUND
      --------------------------------------------------- */

      if (!guest) {

        return res.status(404).json({

          success:
            false,

          message:
            "Mgeni mwenye code hiyo hakupatikana."

        });

      }


      /* ---------------------------------------------------
         ALREADY CHECKED IN
      --------------------------------------------------- */

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


      /* ---------------------------------------------------
         CHECK-IN
      --------------------------------------------------- */

      const {
        data: updatedGuest,
        error: updateError
      } = await supabase

        .from("guests")

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


        return res.status(500).json({

          success:
            false,

          message:
            updateError.message

        });

      }


      console.log(
        "Guest checked in:",
        updatedGuest.full_name,
        updatedGuest.guest_code
      );


      return res.status(200).json({

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


      return res.status(500).json({

        success:
          false,

        message:
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

    res.status(200).json({

      success:
        true,

      message:
        "GeitaCard server iko hai."

    });

  }
);

/* =========================================================
   QR CODE CHECK-IN
   ADD-ONLY FEATURE
========================================================= */

app.post(
  "/api/check-in-qr",
  async (req, res) => {

    try {

      const {
        qr_token
      } = req.body;


      /* ---------------------------------------------------
         VALIDATION
      --------------------------------------------------- */

      if (!qr_token) {

        return res.status(400).json({

          success: false,

          message:
            "QR Token inahitajika."

        });

      }


      const qrToken =
        String(
          qr_token
        ).trim();


      /* ---------------------------------------------------
         TAFUTA MGENI KWA QR TOKEN
      --------------------------------------------------- */

      const {
        data: guest,
        error: findError
      } = await supabase

        .from("guests")

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


        return res.status(500).json({

          success: false,

          message:
            findError.message

        });

      }


      /* ---------------------------------------------------
         QR HAIPATIKANI
      --------------------------------------------------- */

      if (!guest) {

        return res.status(404).json({

          success: false,

          message:
            "QR Code hii si ya mgeni aliyesajiliwa."

        });

      }


      /* ---------------------------------------------------
         TAYARI AME-CHECK-IN
      --------------------------------------------------- */

      if (
        guest.scanned_at
      ) {

        return res.status(409).json({

          success: false,

          alreadyCheckedIn: true,

          message:
            "Mgeni huyu tayari ameshaingia ukumbini.",

          guest: guest

        });

      }


      /* ---------------------------------------------------
         CHECK-IN KWA QR
      --------------------------------------------------- */

      const {
        data: updatedGuest,
        error: updateError
      } = await supabase

        .from("guests")

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


        return res.status(500).json({

          success: false,

          message:
            updateError.message

        });

      }


      console.log(
        "QR CHECK-IN SUCCESS:",
        updatedGuest.full_name,
        updatedGuest.guest_code
      );


      return res.status(200).json({

        success: true,

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


      return res.status(500).json({

        success: false,

        message:
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
      "=============================================="
    );

  }
);
