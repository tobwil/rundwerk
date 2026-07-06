const allowedProfiles = new Set(["fastbike", "trekking", "gravel", "mtb"]);

function response(statusCode, body, contentType = "application/json; charset=utf-8") {
  return {
    statusCode,
    headers: {
      "content-type": contentType,
      "cache-control": "no-store"
    },
    body
  };
}

export async function handler(event) {
  try {
    const params = event.queryStringParameters || {};
    const lonlats = params.lonlats;
    const profile = params.profile || "trekking";

    if (!lonlats || !/^[\d.,| -]+$/.test(lonlats)) {
      return response(400, JSON.stringify({ error: "Ungültige Wegpunkte." }));
    }
    if (!allowedProfiles.has(profile)) {
      return response(400, JSON.stringify({ error: "Unbekanntes Profil." }));
    }

    const target = new URL("https://brouter.de/brouter");
    target.searchParams.set("lonlats", lonlats);
    target.searchParams.set("profile", profile);
    target.searchParams.set("alternativeidx", "0");
    target.searchParams.set("format", "geojson");
    target.searchParams.set("timode", "2");

    if (profile === "trekking") {
      target.searchParams.set("profile:avoid_unsafe", "1");
      target.searchParams.set("profile:correctMisplacedViaPoints", "1");
      target.searchParams.set("profile:correctMisplacedViaPointsDistance", "1200");
    }
    if (profile === "fastbike") {
      target.searchParams.set("profile:consider_traffic", "1");
      target.searchParams.set("profile:correctMisplacedViaPoints", "1");
      target.searchParams.set("profile:correctMisplacedViaPointsDistance", "1200");
    }

    const upstream = await fetch(target, {
      headers: {
        "user-agent": "Rundwerk/1.0 (+https://github.com/tobwil/rundwerk)"
      },
      signal: AbortSignal.timeout(30000)
    });
    const body = await upstream.text();

    return response(
      upstream.status,
      body,
      upstream.headers.get("content-type") || "application/json; charset=utf-8"
    );
  } catch (error) {
    console.error("Route function failed:", error);
    return response(502, JSON.stringify({ error: "Der Routingdienst ist gerade nicht erreichbar." }));
  }
}
