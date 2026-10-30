const TZ = process.env.ADMIN_TIMEZONE ?? "Asia/Baku";
const dtf = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
const df = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });

export const fmtDateTime = (v: string | null | undefined) => (v ? dtf.format(new Date(v)) : "—");
export const fmtDate = (v: string | null | undefined) => (v ? df.format(new Date(v)) : "—");
export const fmtNum = (v: number | string | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("ru-RU").format(Number(v));

export function ago(v: string | null | undefined) {
  if (!v) return "никогда";
  const s = Math.max(0, (Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return "только что";
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "вчера" : `${d} дн назад`;
}

export const STATUS_LABEL: Record<string, string> = {
  uploaded: "Загружен",
  processing: "В работе",
  ready: "Готов",
  failed: "Ошибка",
};

export const statusPill = (s: string) =>
  s === "ready" ? "pill pill--good" : s === "failed" ? "pill pill--bad" : s === "processing" ? "pill pill--warn" : "pill";

export const RELATION_LABEL: Record<string, string> = {
  self: "Я",
  partner: "Партнёр",
  child: "Ребёнок",
  parent: "Родитель",
  sibling: "Брат/сестра",
  grandparent: "Бабушка/дедушка",
  other: "Другое",
};

export const EVENT_LABEL: Record<string, string> = {
  app_open: "Открыл приложение",
  screen_view: "Экран",
  sign_up: "Регистрация",
  sign_in: "Вход",
  sign_out: "Выход",
  member_added: "Добавил члена семьи",
  member_updated: "Изменил профиль",
  member_deleted: "Удалил члена семьи",
  upload_started: "Начал загрузку",
  report_uploaded: "Загрузил анализ",
  analysis_ready: "Разбор готов",
  analysis_failed: "Ошибка разбора",
  analysis_refined: "Разбор уточнён",
  checkin_submitted: "Ответил на вопросы",
  report_deleted: "Удалил анализ",
  report_shared: "Поделился разбором",
  push_opened: "Открыл пуш",
  push_enabled: "Включил пуши",
  inbox_opened: "Открыл уведомления",
  language_changed: "Сменил язык",
  account_deleted: "Удалил аккаунт",
};

export const fmtUsd = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0);
  if (!n) return "$0";
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
};

export const ADMIN_ACTION_LABEL: Record<string, string> = {
  ban: "Заблокирован админом",
  unban: "Разблокирован админом",
  grant_admin: "Выдан доступ к админке",
  revoke_admin: "Убран доступ к админке",
  note: "Изменена заметка",
  delete_user: "Аккаунт удалён",
  rerun_report: "Разбор перезапущен админом",
  view_health: "Админ открыл раздел «Здоровье»",
  view_report: "Админ открыл анализ",
};
