function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

export async function handler(event) {
  try {
    const query = (event.queryStringParameters?.q || "").trim();
    if (query.length < 3) return response(200, []);

    const target = new URL("https://nominatim.openstreetmap.org/search");
    target.searchParams.set("q", query);
    target.searchParams.set("format", "jsonv2");
    target.searchParams.set("limit", "5");
    target.searchParams.set("addressdetails", "1");

    const upstream = await fetch(target, {
      headers: {
        "user-agent": "Rundwerk/1.0 (+https://github.com/tobwil/rundwerk)",
        "accept-language": "de"
      },
      signal: AbortSignal.timeout(10000)
    });
    const data = await upstream.json();
    return response(upstream.status, data);
  } catch (error) {
    console.error("Search function failed:", error);
    return response(502, { error: "Die Ortssuche ist gerade nicht erreichbar." });
  }
}
