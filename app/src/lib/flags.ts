const CODES: Record<string, string> = {
  argentina: "ar", france: "fr", brazil: "br", england: "gb-eng", spain: "es",
  germany: "de", morocco: "ma", croatia: "hr", portugal: "pt", netherlands: "nl",
  "united states": "us", usa: "us", mexico: "mx", canada: "ca", italy: "it",
  belgium: "be", uruguay: "uy", colombia: "co", japan: "jp", "south korea": "kr",
  senegal: "sn", switzerland: "ch", denmark: "dk", poland: "pl", serbia: "rs",
  ghana: "gh", cameroon: "cm", ecuador: "ec", australia: "au", "saudi arabia": "sa",
  qatar: "qa", scotland: "gb-sct", wales: "gb-wls", nigeria: "ng", egypt: "eg",
};

// FIFA-style 3-letter codes for the scoreboard.
const ABBRS: Record<string, string> = {
  argentina: "ARG", france: "FRA", brazil: "BRA", england: "ENG", spain: "ESP",
  germany: "GER", morocco: "MAR", croatia: "CRO", portugal: "POR", netherlands: "NED",
  "united states": "USA", usa: "USA", mexico: "MEX", canada: "CAN", italy: "ITA",
  belgium: "BEL", uruguay: "URU", colombia: "COL", japan: "JPN", "south korea": "KOR",
  senegal: "SEN", switzerland: "SUI", denmark: "DEN", poland: "POL", serbia: "SRB",
  ghana: "GHA", cameroon: "CMR", ecuador: "ECU", australia: "AUS", "saudi arabia": "KSA",
  qatar: "QAT", scotland: "SCO", wales: "WAL", nigeria: "NGA", egypt: "EGY",
};

// Primary home-kit colors (broadcast kit-indicator dots).
const KITS: Record<string, string> = {
  argentina: "#6CACE4", france: "#2B4FB0", brazil: "#FFDC00", england: "#F1F5F9", spain: "#C8102E",
  germany: "#E5E9F0", morocco: "#C1272D", croatia: "#E11D2E", portugal: "#C8102E", netherlands: "#F36C21",
  "united states": "#2B4FB0", usa: "#2B4FB0", mexico: "#0A7B3E", canada: "#D81E2E", italy: "#2B6FD6",
  belgium: "#C8102E", uruguay: "#5CA4E4", colombia: "#FCD116", japan: "#2B4FB0", "south korea": "#D81E2E",
  senegal: "#0A7B3E", switzerland: "#D52B1E", denmark: "#C8102E", poland: "#E11D2E", serbia: "#C8102E",
  ghana: "#CE1126", cameroon: "#0A9639", ecuador: "#FFD100", australia: "#FFD100", "saudi arabia": "#0A6C35",
  qatar: "#8A1538", scotland: "#1763B6", wales: "#C8102E", nigeria: "#0A8751", egypt: "#C8102E",
};

export function flagUrl(team: string): string | null {
  const code = CODES[team.trim().toLowerCase()];
  return code ? `https://flagcdn.com/h40/${code}.png` : null;
}

export function teamAbbr(team: string): string {
  const k = team.trim().toLowerCase();
  return ABBRS[k] ?? team.trim().slice(0, 3).toUpperCase();
}

export function kitColor(team: string): string {
  const k = team.trim().toLowerCase();
  return KITS[k] ?? "#94a3b8";
}
