const OFFICE_HOUR_START = 9;
const OFFICE_MINUTE_START = 30;
const OFFICE_HOUR_END = 16;
const OFFICE_MINUTE_END = 30;
const INDIA_TIMEZONE = "Asia/Kolkata";

function getIndiaDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

export function getAttendanceStatusForLogin(loginDate) {
  const { hour: hours, minute: minutes } = getIndiaDateParts(loginDate);
  const currentMinutes = hours * 60 + minutes;
  const thresholdMinutes = OFFICE_HOUR_START * 60 + OFFICE_MINUTE_START;
  return currentMinutes <= thresholdMinutes ? "Present" : "Late";
}

export function isEarlyLogout(logoutDate) {
  const { hour: hours, minute: minutes } = getIndiaDateParts(logoutDate);
  const currentMinutes = hours * 60 + minutes;
  const thresholdMinutes = OFFICE_HOUR_END * 60 + OFFICE_MINUTE_END;
  return currentMinutes < thresholdMinutes;
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

export function isWithinGeofence(lat1, lon1, lat2, lon2, radiusMeters) {
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = earthRadius * c;
  return distance <= radiusMeters;
}

export function getDateKey(date) {
  const { year, month, day } = getIndiaDateParts(date);
  const monthValue = String(month).padStart(2, "0");
  const dayValue = String(day).padStart(2, "0");
  return `${year}-${monthValue}-${dayValue}`;
}

export function isValidLatitude(value) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}
