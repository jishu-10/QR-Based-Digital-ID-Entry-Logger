export default async function handler(req, res) {
  const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby9B1BgbkLdnQ_g_n3b97gsqi85HJx61j2h79MkEcehVRr9Uuzw6uwDItK9y4sKB82CKw/exec";

  try {
    const url = new URL(APPS_SCRIPT_URL);

    Object.entries(req.query).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const options = {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (req.method === "POST") {
      options.body = JSON.stringify(req.body);
    }

    const response = await fetch(url.toString(), options);
    const data = await response.text();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    res.status(200).send(data);

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}
