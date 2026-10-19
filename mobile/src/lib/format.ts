export function ageOf(birthDate: string | null | undefined, at: Date = new Date()): number | null {
  if (!birthDate) return null;
  const b = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(b.getTime())) return null;
  let age = at.getFullYear() - b.getFullYear();
  const m = at.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < b.getDate())) age--;
  return age >= 0 ? age : null;
}
