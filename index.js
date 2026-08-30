const express = require("express");
const axios = require("axios");
const XLSX = require("xlsx");
const crypto = require("crypto");
const QRCode = require("qrcode");
const sharp = require("sharp");

const {
  createClient
} = require("@supabase/supabase-js");

const app = express();


/* =========================================================
   EXPRESS
========================================================= */

app.use(
  express.json({
    limit: "20mb"
  })
);

app.use(
  express.static("public")
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
   QR SETTINGS
========================================================= */

/*
  Personalized QR imewashwa.

  Ukiweka:
  ENABLE_PERSONALIZED_QR=false

  mfumo utarudi kutumia INVITE_IMAGE_URL
  kama picha ya kawaida.
*/

const ENABLE_PERSONALIZED_QR =
  String(
    process.env.ENABLE_PERSONALIZED_QR ||
    "true"
  )
    .toLowerCase() ===
  "true";


/*
  Jina la Supabase Storage bucket.

  Tutaiweka:
  guest-cards
*/

const INVITE_BUCKET =
  process.env.INVITE_BUCKET ||
  "guest-cards";


/*
  QR size kwa kadi hii.

  Kadi yako ni 1024 x 1536.

  QR inawekwa kwenye kisanduku
  cha cream kilicho chini upande wa kulia.
*/

const QR_SIZE =
  Number(
    process.env.QR_SIZE ||
    150
  );


const QR_X =
  Number(
    process.env.QR_X ||
    505
  );


const QR_Y =
  Number(
    process.env.QR_Y ||
    1205
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
  "QR System:",
  ENABLE_PERSONALIZED_QR
    ? "ENABLED"
    : "DISABLED"
);

console.log(
  "Manual Code Check-in:",
  "ENABLED"
);

console.log(
  "QR Check-in:",
  "ENABLED"
);

console.log(
  "Storage Bucket:",
  INVITE_BUCKET
);

console.log(
  "QR Position:",
  QR_X,
  QR_Y
);

console.log(
  "QR Size:",
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
   GET INVITATION TYPE
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
   CREATE QR TOKEN
========================================================= */

function createQrToken() {

  /*
    randomUUID ni token ya kipekee sana.

    Token hii ndiyo itawekwa ndani ya QR.

    HAITUMII CODE.

    Mfano:

    9750-KAMATI
        ↓
    qr_token = UUID tofauti kabisa
  */

  return crypto.randomUUID();

}


/* =========================================================
   GENERATE QR BUFFER
========================================================= */

async function generateQrBuffer(
  qrToken
) {

  if (!qrToken) {

    throw new Error(
      "QR Token haipo."
    );

  }


  /*
    QR ina token tu.

    Hatuweki jina au code ndani ya QR.

    Token ndiyo inayotafuta mgeni
    kwenye database.
  */

  const qrBuffer =
    await QRCode.toBuffer(
      String(qrToken),
      {

        type:
          "png",

        width:
          QR_SIZE,

        margin:
          2,

        errorCorrectionLevel:
          "H",

        color: {

          dark:
            "#000000",

          light:
            "#FFFFFF"

        }

      }
    );


  return qrBuffer;

}


/* =========================================================
   FETCH BASE INVITATION IMAGE
========================================================= */

async function fetchBaseInvitationImage() {

  if (!INVITE_IMAGE_URL) {

    throw new Error(
      "INVITE_IMAGE_URL haijawekwa kwenye Render Environment."
    );

  }


  console.log(
    "Downloading base invitation image..."
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
   CREATE PERSONALIZED CARD
========================================================= */

async function createPersonalizedCard(
  qrToken
) {

  if (
    !ENABLE_PERSONALIZED_QR
  ) {

    return null;

  }


  console.log(
    "Creating personalized QR card..."
  );


  const baseImage =
    await fetchBaseInvitationImage();


  const qrBuffer =
    await generateQrBuffer(
      qrToken
    );


  /*
    Tunatumia Sharp kuweka QR
    juu ya kadi.

    Coordinates zimetengenezwa
    kwa kadi yako ya 1024x1536.

    QR inaingia kwenye box
    ya cream iliyo chini.
  */

  const output =
    await sharp(
      baseImage
    )
      .composite([

        {

          input:
            qrBuffer,

          left:
            QR_X,

          top:
            QR_Y

        }

      ])
      .jpeg({

        quality:
          95,

        mozjpeg:
          true

      })
      .toBuffer();


  console.log(
    "Personalized QR card created."
  );


  return output;

}


/* =========================================================
   GET PUBLIC STORAGE URL
========================================================= */

function getStoragePublicUrl(
  path
) {

  return (
    `${SUPABASE_URL}` +
    `/storage/v1/object/public/` +
    `${INVITE_BUCKET}/` +
    `${path}`
  );

}


/* =========================================================
   UPLOAD PERSONALIZED CARD
========================================================= */

async function uploadPersonalizedCard(
  cardBuffer,
  guestId,
  qrToken
) {

  if (!cardBuffer) {

    return null;

  }


  /*
    Kila mgeni anapata filename
    yake.

    Hivyo picha za wageni
    hazitachanganyika.
  */

  const safeGuestId =
    String(
      guestId
    )
      .replace(
        /[^a-zA-Z0-9_-]/g,
        ""
      );


  const safeQrToken =
    String(
      qrToken
    )
      .replace(
        /[^a-zA-Z0-9_-]/g,
        ""
      );


  const filePath =
    `guest-cards/${safeGuestId}-${safeQrToken}.jpg`;


  console.log(
    "Uploading personalized card:",
    filePath
  );


  const {
    error
  } = await supabase
    .storage
    .from(
      INVITE_BUCKET
    )
    .upload(
      filePath,
      cardBuffer,
      {

        contentType:
          "image/jpeg",

        upsert:
          true,

        cacheControl:
          "31536000"

      }
    );


  if (error) {

    console.error(
      "Storage upload error:",
      error.message
    );

    throw error;

  }


  const publicUrl =
    getStoragePublicUrl(
      filePath
    );


  console.log(
    "Personalized card URL:",
    publicUrl
  );


  return {

    path:
      filePath,

    url:
      publicUrl

  };

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
    normalizePhone(
      to
    );


  /*
    MUHIMU:

    Kila mgeni anapata QR TOKEN
    yake tofauti.

    QR token hii ndiyo itakayohifadhiwa
    kwenye database.
  */

  const qrToken =
    createQrToken();


  const invitationType =
    getInvitationType(
      code
    );


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
    data.guest_code,
    "QR:",
    data.qr_token
  );


  return data;

}


/* =========================================================
   DELETE GUEST
   USED WHEN SEND FAILS
========================================================= */

async function deleteGuest(
  guestId
) {

  if (!guestId) {

    return;

  }


  try {

    const {
      error
    } = await supabase

      .from(
        "guests"
      )

      .delete()

      .eq(
        "id",
        guestId
      );


    if (error) {

      console.error(
        "Delete guest error:",
        error.message
      );

    }

  } catch (error) {

    console.error(
      "Delete guest exception:",
      error.message
    );

  }

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
  customImageUrl = null
) {

  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;


  const components = [];


  /*
    Tumia personalized image
    ikiwa ipo.

    Kama haipo, tumia
    INVITE_IMAGE_URL ya kawaida.
  */

  const imageUrl =
    customImageUrl ||
    INVITE_IMAGE_URL;


  /* -------------------------------------------------------
     HEADER IMAGE
  ------------------------------------------------------- */

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

        /*
          CODE HAIBADILISHWI.

          Inatumwa exactly kama
          ilivyo kwenye Excel.
        */

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
   CREATE + SEND PERSONALIZED INVITATION
========================================================= */

async function createAndSendInvitation(
  to,
  name,
  code
) {

  let guest =
    null;


  try {

    /*
      STEP 1

      Save guest first.

      Sababu tunahitaji
      qr_token kutoka database.
    */

    guest =
      await saveGuest(
        to,
        name,
        code
      );


    let personalizedImageUrl =
      null;


    /*
      STEP 2

      Tengeneza QR card.
    */

    if (
      ENABLE_PERSONALIZED_QR
    ) {

      const cardBuffer =
        await createPersonalizedCard(
          guest.qr_token
        );


      /*
        STEP 3

        Upload card kwa Supabase Storage.
      */

      const storageResult =
        await uploadPersonalizedCard(
          cardBuffer,
          guest.id,
          guest.qr_token
        );


      personalizedImageUrl =
        storageResult.url;


      /*
        STEP 4

        Hifadhi URL ya kadi
        kwenye database.

        Ikiwa column haipo,
        mfumo hautavunja send.
      */

      try {

        const {
          error
        } = await supabase

          .from(
            "guests"
          )

          .update({

            card_image_url:
              personalizedImageUrl

          })

          .eq(
            "id",
            guest.id
          );


        if (error) {

          console.warn(
            "card_image_url haiku-save:",
            error.message
          );

        }

      } catch (error) {

        console.warn(
          "card_image_url update skipped:",
          error.message
        );

      }

    }


    /*
      STEP 5

      Send WhatsApp.

      Kadi personalized ndiyo
      itatumwa.
    */

    const whatsappResult =
      await sendInvitation(
        to,
        name,
        code,
        personalizedImageUrl
      );


    return {

      guest:
        guest,

      result:
        whatsappResult,

      card_image_url:
        personalizedImageUrl

    };

  } catch (error) {

    /*
      Kama send imefail baada ya
      guest ku-save, tunajaribu
      kuondoa record ili tabia
      ya mfumo wa zamani ibaki:
      SAVE ONLY IF SEND SUCCESS.
    */

    if (
      guest?.id
    ) {

      await deleteGuest(
        guest.id
      );

    }


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
    normalizePhone(
      phone
    );


  const {
    data: guest,
    error: findError
  } = await supabase

    .from(
      "guests"
    )

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
         OLD BUTTON
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


      const result =
        await createAndSendInvitation(
          cleanTo,
          cleanName,
          cleanCode
        );


      return res.status(200).json({

        success:
          true,

        result:
          result.result,

        guest:
          result.guest,

        card_image_url:
          result.card_image_url

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
          CODE HAITENGENEZWI.

          Inachukuliwa moja kwa moja
          kutoka Excel/CSV.
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


          /*
            CREATE UNIQUE QR
            SAVE DATABASE
            CREATE PERSONALIZED CARD
            UPLOAD STORAGE
            SEND WHATSAPP
          */

          const sendResult =
            await createAndSendInvitation(
              to,
              name,
              code
            );


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
              sendResult.guest,

            card_image_url:
              sendResult.card_image_url,

            result:
              sendResult.result

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
          Pause kati ya messages.

          Sekunde 1 kama mfumo wako
          wa zamani.
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


      const {
        data,
        error
      } = await supabase

        .from(
          "guests"
        )

        .select(
          "full_name, phone, guest_code, invitation_type, attendance_status, qr_token, scanned_at, created_at"
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


      const rows =
        (
          data || []
        ).map(
          (
            guest,
            index
          ) => ({

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

            "Aina":
              guest.invitation_type ||
              "",

            "QR Token":
              guest.qr_token ||
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
            40
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
   MANUAL CHECK-IN BY CODE
========================================================= */

app.post(
  "/api/check-in",
  async (req, res) => {

    try {

      const {
        code
      } = req.body;


      if (!code) {

        return res.status(400).json({

          success:
            false,

          message:
            "Code ya mgeni inahitajika."

        });

      }


      /*
        Code haibadilishwi.

        Spaces za mwanzo/mwisho tu
        ndizo zinaondolewa.
      */

      const guestCode =
        String(
          code
        ).trim();


      console.log(
        "CHECK-IN CODE:",
        guestCode
      );


      const {
        data: guest,
        error: findError
      } = await supabase

        .from(
          "guests"
        )

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


      if (!guest) {

        return res.status(404).json({

          success:
            false,

          message:
            "Mgeni mwenye code hiyo hakupatikana."

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
      } = await supabase

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
   QR CODE CHECK-IN
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

          success:
            false,

          message:
            "QR Token inahitajika."

        });

      }


      /*
        QR token inatumika
        kama ilivyo.

        Hatuibadilishi.
      */

      const qrToken =
        String(
          qr_token
        ).trim();


      console.log(
        "QR CHECK-IN TOKEN:",
        qrToken
      );


      /* ---------------------------------------------------
         SEARCH BY QR TOKEN
      --------------------------------------------------- */

      const {
        data: guest,
        error: findError
      } = await supabase

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


        return res.status(500).json({

          success:
            false,

          message:
            findError.message

        });

      }


      /* ---------------------------------------------------
         QR HAIPATIKANI
      --------------------------------------------------- */

      if (!guest) {

        return res.status(404).json({

          success:
            false,

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


        return res.status(500).json({

          success:
            false,

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
   OPTIONAL: CHECK QR TOKEN
========================================================= */

app.get(
  "/api/qr/:token",
  async (req, res) => {

    try {

      const token =
        String(
          req.params.token ||
          ""
        ).trim();


      if (!token) {

        return res.status(400).json({

          success:
            false,

          message:
            "QR token haipo."

        });

      }


      const {
        data: guest,
        error
      } = await supabase

        .from(
          "guests"
        )

        .select(
          "id, full_name, phone, guest_code, invitation_type, attendance_status, scanned_at"
        )

        .eq(
          "qr_token",
          token
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
            "QR Token haijatambuliwa."

        });

      }


      return res.status(200).json({

        success:
          true,

        guest:
          guest

      });


    } catch (error) {

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
      "QR System:",
      ENABLE_PERSONALIZED_QR
        ? "ENABLED"
        : "DISABLED"
    );

    console.log(
      "Storage Bucket:",
      INVITE_BUCKET
    );

    console.log(
      "=============================================="
    );

  }
);
