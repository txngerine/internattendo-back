const OFFICE_HOUR_START = 9;
const OFFICE_MINUTE_START = 30;
const OFFICE_HOUR_END = 17;
const OFFICE_MINUTE_END = 0;

export function getAttendanceStatusForLogin(loginDate) {
  const hours = loginDate.getUTCHours();
  const minutes = loginDate.getUTCMinutes();
  const currentMinutes = hours * 60 + minutes;
  const thresholdMinutes = OFFICE_HOUR_START * 60 + OFFICE_MINUTE_START;
  return currentMinutes <= thresholdMinutes ? "Present" : "Late";
}

export function isEarlyLogout(logoutDate) {
  const hours = logoutDate.getUTCHours();
  const minutes = logoutDate.getUTCMinutes();
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
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidLatitude(value) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}
