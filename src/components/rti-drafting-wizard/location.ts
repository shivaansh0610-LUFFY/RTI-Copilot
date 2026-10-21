// Where the citizen says the problem is. It reaches the backend as one "Location:" line inside
// the grievance text, so the clarify and decompose steps treat it like any other detail the
// citizen stated, and no photo or coordinates travel anywhere else.
export interface IssueLocation {
  latitude: number;
  longitude: number;
  accuracyMeters?: number; // only for a GPS fix, not for a pin the citizen placed
  address?: string; // from /geocode; absent while it is being looked up or when none was found
}

// The map starts here when there is no GPS fix to start from.
export const DELHI_CENTER = { latitude: 28.6139, longitude: 77.209 };

// A rough box round the National Capital Territory (28.40-28.88 N, 76.84-77.35 E). Parts of
// Gurugram, Faridabad and Ghaziabad lie inside it, so it can say "clearly outside Delhi" but
// never "inside Delhi".
export function isClearlyOutsideDelhi({ latitude, longitude }: IssueLocation): boolean {
  return latitude < 28.4 || latitude > 28.88 || longitude < 76.84 || longitude > 77.35;
}

export function formatCoordinates({ latitude, longitude }: IssueLocation): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

export function locationLine(location: IssueLocation): string {
  return location.address
    ? `Location: ${location.address} (${formatCoordinates(location)})`
    : `Location: ${formatCoordinates(location)}`;
}

// Only a line in the shape locationLine() writes. A "Location: near the temple" the citizen
// typed themselves has no coordinates, so it is never replaced or removed.
const OUR_LOCATION_LINE = /^Location: (?:.+ \(-?\d+\.\d+, -?\d+\.\d+\)|-?\d+\.\d+, -?\d+\.\d+)$/;

// The text with its location line set to `line` (added if there is none), or taken out when
// `line` is undefined.
export function withLocationLine(text: string, line: string | undefined): string {
  const lines = text.split("\n");
  const index = lines.findLastIndex((candidate) => OUR_LOCATION_LINE.test(candidate));
  if (index !== -1) {
    if (line === undefined) lines.splice(index, 1);
    else lines[index] = line;
    return lines.join("\n").trimEnd();
  }
  if (line === undefined) return text;
  const trimmed = text.trimEnd();
  return trimmed ? `${trimmed}\n\n${line}` : line;
}

// A link that opens the spot in Google Maps. It needs no API key; it is only a convenience for
// a citizen who wants to check the spot in the app they already use.
export function googleMapsUrl({ latitude, longitude }: IssueLocation): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}
