const CITY_ALIASES: Record<string, string> = {
  bengaluru: "bangalore",
  "bangalore, india": "bangalore",
  "bengaluru, india": "bangalore",
  "hyderabad, india": "hyderabad",
};

export function normalizeLocation(location: string): string {
  const cleaned = location
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
  return CITY_ALIASES[cleaned] ?? cleaned.replace(/,\s*india$/, "");
}
export function displayLocation(location: string): string {
  return location
    .split(",")
    .map((part) => part.trim().replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase()))
    .join(", ");
}
