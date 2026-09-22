export type NormalizedLocation = {
  city: string;
  canonicalCity: string;
  stateOrProvince?: string;
  country?: string;
  countryCode?: string;
};

type LocationRecord = Omit<NormalizedLocation, "city" | "canonicalCity"> & { canonicalCity: string; aliases: string[] };

const known: LocationRecord[] = [
  { canonicalCity: "Hyderabad", aliases: ["hyderabad"], stateOrProvince: "Telangana", country: "India", countryCode: "IN" },
  { canonicalCity: "Bengaluru", aliases: ["bengaluru", "bangalore"], stateOrProvince: "Karnataka", country: "India", countryCode: "IN" },
  { canonicalCity: "Mumbai", aliases: ["mumbai", "bombay"], stateOrProvince: "Maharashtra", country: "India", countryCode: "IN" },
  { canonicalCity: "Chennai", aliases: ["chennai", "madras"], stateOrProvince: "Tamil Nadu", country: "India", countryCode: "IN" },
  { canonicalCity: "Kolkata", aliases: ["kolkata", "calcutta"], stateOrProvince: "West Bengal", country: "India", countryCode: "IN" },
  { canonicalCity: "Delhi", aliases: ["delhi", "new delhi"], stateOrProvince: "Delhi", country: "India", countryCode: "IN" },
  { canonicalCity: "Pune", aliases: ["pune", "poona"], stateOrProvince: "Maharashtra", country: "India", countryCode: "IN" },
  { canonicalCity: "London", aliases: ["london"], stateOrProvince: "England", country: "United Kingdom", countryCode: "GB" },
  { canonicalCity: "Manchester", aliases: ["manchester"], stateOrProvince: "England", country: "United Kingdom", countryCode: "GB" },
  { canonicalCity: "Singapore", aliases: ["singapore"], country: "Singapore", countryCode: "SG" },
  { canonicalCity: "San Francisco", aliases: ["san francisco"], stateOrProvince: "California", country: "United States", countryCode: "US" },
  { canonicalCity: "New York", aliases: ["new york", "nyc"], stateOrProvince: "New York", country: "United States", countryCode: "US" },
];

export function normalizeLocation(input: string): NormalizedLocation {
  const city = input.trim().replace(/\s+/g, " ");
  const parts = city.toLowerCase().split(",").map((part) => part.trim());
  const match = known.find((item) => item.aliases.includes(parts[0]) && parts.slice(1).every((part) =>
    [item.stateOrProvince?.toLowerCase(), item.country?.toLowerCase(), item.countryCode?.toLowerCase(), ...(item.countryCode === "GB" ? ["uk", "great britain"] : [])].includes(part)));
  if (!match) return { city, canonicalCity: city };
  return { city: match.canonicalCity, canonicalCity: match.canonicalCity, ...(match.stateOrProvince ? { stateOrProvince: match.stateOrProvince } : {}), country: match.country, countryCode: match.countryCode };
}

export function classifyMove(origin: NormalizedLocation, destination: NormalizedLocation): "DOMESTIC" | "INTERNATIONAL" | "UNRESOLVED" {
  if (!origin.countryCode || !destination.countryCode) return "UNRESOLVED";
  return origin.countryCode === destination.countryCode ? "DOMESTIC" : "INTERNATIONAL";
}

export function scopeForCategory(category: string): "ORIGIN" | "DESTINATION" | "BOTH" | "NATIONAL" | "INTERNATIONAL" {
  if (["UTILITIES", "CLOSE_OUT"].includes(category)) return "ORIGIN";
  if (["INTERNET", "FAMILY", "HEALTHCARE", "EDUCATION"].includes(category)) return "BOTH";
  if (["IMMIGRATION", "VISA", "PASSPORT", "CROSS_BORDER_ADMIN"].includes(category)) return "INTERNATIONAL";
  if (["BANKING", "INSURANCE"].includes(category)) return "NATIONAL";
  return "DESTINATION";
}

export function locationText(location?: NormalizedLocation | null): string {
  if (!location) return "Unknown location";
  return [location.canonicalCity, location.stateOrProvince, location.country].filter(Boolean).join(", ");
}
