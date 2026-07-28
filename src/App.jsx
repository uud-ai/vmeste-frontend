import React, { useState, useEffect, useId, useRef } from "react";
import {
  Clock,
  MapPin,
  Bell,
  AlertTriangle,
  MessageSquare,
  CheckCircle2,
  XCircle,
  BookOpen,
  Sparkles,
  Moon,
  Send,
  Star,
  Award,
  ShieldCheck,
  Info,
  Heart,
  TrendingUp,
  PartyPopper,
  Calculator,
  GraduationCap,
  Home,
  Unlock,
  Coffee,
  Flame,
  Eye,
  Utensils,
  Users,
  ChevronRight,
  Check,
  Smartphone,
} from "lucide-react";

/* ============================================================
   ДИЗАЙН-ТОКЕНЫ
   Тёплый шалфейно-белый фон вместо стандартного "кремового";
   насыщенная пастельная палитра с чёткой ролью для каждого цвета.
   ============================================================ */

const palette = {
  bg: "#F6F7F1",
  ink: "#2A2926",
  inkSoft: "#625D55",
  border: "#E7E8DE",

  teal: "#16948A", // спокойствие, учёба, доверие
  tealSoft: "#DCF3EE",
  tealText: "#0D6D63",

  coral: "#FF7A57", // энергия, детская сторона, развлечения
  coralSoft: "#FFE6DC",
  coralText: "#C1502F",

  lavender: "#7C6FD6", // игры, отдых
  lavenderSoft: "#EBE7FC",
  lavenderText: "#5548BE",

  amber: "#E9A431", // средний риск
  amberSoft: "#FBEBD1",
  amberText: "#8A5A0A",

  rose: "#E85572", // высокий риск
  roseSoft: "#FCE1E8",
  roseText: "#B02D4C",

  sky: "#3FAEDB", // фокус, инфо, низкий риск
  skySoft: "#DEF1FB",
  skyText: "#1A6C90",
};

// Крупные автономные числа (таймер, счётчики) — единственное место,
// где используется акцентный дисплейный шрифт. Всё остальное — Nunito.
const displayFont = { fontFamily: "'Unbounded', sans-serif" };

/* ============================================================
   УТИЛИТЫ
   ============================================================ */

function formatDuration(totalMinutes) {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm} мин`;
  if (mm === 0) return `${h} ч`;
  return `${h} ч ${mm} мин`;
}

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function isNowWithinBlock(block) {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = timeToMinutes(block.start);
  const end = timeToMinutes(block.end);
  if (start === end) return false;
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end; // блок переходит через полночь
}

/* ============================================================
   ПОДКЛЮЧЕНИЕ К РЕАЛЬНОМУ БЭКЕНДУ
   ============================================================ */

// Замените на свой адрес после деплоя на Render (см. DEPLOY.md).
const API_BASE = "https://api.vmestefamily.site";

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function apiFetch(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // пустой ответ (например, 204) — не ошибка
  }

  if (!res.ok) {
    throw new ApiError((data && data.error) || `Ошибка сервера (${res.status})`, res.status);
  }
  return data;
}

// Склонение русских слов по числу: pluralRu(3, "минуту", "минуты", "минут") -> "минуты"
function pluralRu(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

// ISO-строка от сервера ("2026-07-26T08:41:43.591Z") -> "12 минут назад" / "сегодня, 14:32" и т.п.
function formatRelativeTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now - date) / 60000);

  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} ${pluralRu(diffMin, "минуту", "минуты", "минут")} назад`;

  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const wasYesterday = date.toDateString() === yesterday.toDateString();
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

  if (sameDay) return `сегодня, ${time}`;
  if (wasYesterday) return `вчера, ${time}`;
  return `${date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}, ${time}`;
}

// Бэкенд не хранит цвет/иконку — подбираем по имени категории и типу блока
// расписания, с запасным вариантом на случай чего-то незнакомого.
const CATEGORY_COLORS = { Видео: palette.coral, Игры: palette.lavender, Учёба: palette.teal, Соцсети: palette.sky };
const FALLBACK_COLORS = [palette.coral, palette.lavender, palette.teal, palette.sky, palette.amber];
function colorForCategory(name, index) {
  return CATEGORY_COLORS[name] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

const BLOCK_TYPE_CONFIG = {
  study: { icon: BookOpen, color: palette.teal },
  sleep: { icon: Moon, color: palette.lavender },
  other: { icon: Utensils, color: palette.coral },
};

// Находит "мягкую" пару для одного из основных цветов палитры (teal -> tealSoft и т.п.),
// чтобы не пришлось алгоритмически высветлять произвольный hex.
const COLOR_TO_SOFT = {
  [palette.teal]: palette.tealSoft,
  [palette.coral]: palette.coralSoft,
  [palette.lavender]: palette.lavenderSoft,
  [palette.amber]: palette.amberSoft,
  [palette.rose]: palette.roseSoft,
  [palette.sky]: palette.skySoft,
};
function softForColor(color) {
  return COLOR_TO_SOFT[color] || palette.bg;
}

/* ============================================================
   ПРЕОБРАЗОВАНИЕ ОТВЕТОВ API В ФОРМУ, КОТОРУЮ ОЖИДАЕТ UI
   ============================================================ */

function mapOverview(data) {
  return {
    usedMinutes: data.usedMinutes,
    limitMinutes: data.limitMinutes,
    bonusMinutes: data.bonusMinutes,
    status: data.status,
    streak: data.streak,
    topApps: (data.topApps || []).map((a, i) => {
      const color = colorForCategory(a.category, i);
      return { id: `${a.name}-${i}`, name: a.name, minutes: a.minutes, color, soft: softForColor(color) };
    }),
    categoryBreakdown: (data.categoryBreakdown || []).map((c, i) => ({
      id: c.category,
      name: c.category,
      minutes: c.minutes,
      color: colorForCategory(c.category, i),
    })),
  };
}

function mapSchedule(rows) {
  return (rows || []).map((b) => {
    const cfg = BLOCK_TYPE_CONFIG[b.block_type] || BLOCK_TYPE_CONFIG.other;
    return { id: b.id, label: b.label, icon: cfg.icon, color: cfg.color, start: b.start_time, end: b.end_time, active: Boolean(b.active) };
  });
}

function mapAlerts(rows) {
  return (rows || []).map((a) => ({
    id: a.id,
    level: a.level,
    risk: a.risk,
    title: a.title,
    description: a.description,
    app: a.app_name,
    time: formatRelativeTime(a.created_at),
    discussed: Boolean(a.discussed),
  }));
}

// Бэкенд не хранит иконку квеста по смыслу задания — используем один
// нейтральный значок для всех реальных квестов.
function mapQuests(rows) {
  return (rows || []).map((q) => ({
    id: q.id,
    title: q.title,
    description: q.description,
    reward: q.reward_minutes,
    status: q.status,
    icon: Award,
  }));
}

function mapRequests(rows) {
  return (rows || []).map((r) => ({
    id: r.id,
    type: r.type,
    questId: r.quest_id,
    amount: r.amount,
    label: r.label,
    reason: r.reason,
    status: r.status,
    createdAt: formatRelativeTime(r.created_at),
  }));
}

function mapHistory(rows) {
  return (rows || []).map((h) => ({
    id: h.id,
    kind: h.status === "approved" ? "approved" : "declined",
    text: `${h.status === "approved" ? "Одобрено" : "Отклонено"}: ${h.label}`,
    comment: h.parent_comment,
    time: formatRelativeTime(h.resolved_at),
  }));
}

/* ============================================================
   СПРАВОЧНИКИ ОТОБРАЖЕНИЯ (по ключам, которые реально шлёт бэкенд)
   ============================================================ */

const LEVEL_CONFIG = {
  high: { color: palette.rose, soft: palette.roseSoft, text: palette.roseText, icon: AlertTriangle, label: "Высокий риск" },
  medium: { color: palette.amber, soft: palette.amberSoft, text: palette.amberText, icon: Info, label: "Средний риск" },
  low: { color: palette.sky, soft: palette.skySoft, text: palette.skyText, icon: Eye, label: "Низкий риск" },
};

const STATUS_CONFIG = {
  online: { label: "В сети", color: palette.teal, soft: palette.tealSoft, text: palette.tealText, icon: Smartphone },
  studying: { label: "Учится", color: palette.sky, soft: palette.skySoft, text: palette.skyText, icon: BookOpen },
  resting: { label: "Отдыхает", color: palette.lavender, soft: palette.lavenderSoft, text: palette.lavenderText, icon: Coffee },
};

/* ============================================================
   БАЗОВЫЕ UI-КОМПОНЕНТЫ
   ============================================================ */

// Фирменный знак: два пересекающихся круга — «пространство, которое
// видно с обеих сторон», а не одностороннее наблюдение.
function TrustMark({ size = 36 }) {
  const rawId = useId();
  const clipId = `tm-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg width={size} height={(size * 40) / 44} viewBox="0 0 44 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <circle cx="15" cy="20" r="14" />
        </clipPath>
      </defs>
      <circle cx="15" cy="20" r="14" fill={palette.teal} />
      <circle cx="29" cy="20" r="14" fill={palette.coral} />
      <circle cx="29" cy="20" r="14" fill={palette.amber} clipPath={`url(#${clipId})`} />
    </svg>
  );
}

function Card({ className = "", children, style }) {
  return (
    <div className={`bg-white rounded-3xl border shadow-sm p-5 sm:p-6 ${className}`} style={{ borderColor: palette.border, ...style }}>
      {children}
    </div>
  );
}

function SectionHeading({ title, subtitle, icon: Icon, right }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: palette.tealSoft, color: palette.tealText }}>
            <Icon size={20} />
          </div>
        )}
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold" style={{ color: palette.ink }}>
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm mt-0.5" style={{ color: palette.inkSoft }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {right}
    </div>
  );
}

function Badge({ children, color, soft }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: soft, color }}>
      {children}
    </span>
  );
}

function ToggleSwitch({ checked, onChange, activeColor = palette.teal }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-7 w-12 items-center rounded-full shrink-0"
      style={{ backgroundColor: checked ? activeColor : "#E2DFD5", transition: "background-color 0.2s ease" }}
      aria-pressed={checked}
    >
      <span
        className="inline-block h-5 w-5 transform rounded-full bg-white shadow"
        style={{ transform: checked ? "translateX(22px)" : "translateX(4px)", transition: "transform 0.2s ease" }}
      />
    </button>
  );
}

function PrimaryButton({ children, onClick, disabled, className = "", style, icon: Icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${className}`}
      style={{ backgroundColor: palette.teal, color: "white", ...style }}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, disabled, className = "", icon: Icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold border transition-all duration-150 active:scale-95 disabled:opacity-50 ${className}`}
      style={{ borderColor: palette.border, color: palette.ink, backgroundColor: "white" }}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

function RadialProgress({ value, max, size = 148, strokeWidth = 14, color, trackColor, children }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const offset = circumference * (1 - pct);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

function MiniMap({ label = "Дома", address = "ул. Солнечная, 14", updatedAgo = "2 минуты назад" }) {
  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ height: 150, backgroundColor: palette.tealSoft }}>
      <svg viewBox="0 0 300 150" className="absolute inset-0 w-full h-full" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 40 L300 55" stroke="#BFE6DF" strokeWidth="10" />
        <path d="M0 112 L300 96" stroke="#BFE6DF" strokeWidth="10" />
        <path d="M64 0 L44 150" stroke="#BFE6DF" strokeWidth="8" />
        <path d="M228 0 L250 150" stroke="#BFE6DF" strokeWidth="8" />
        <rect x="92" y="56" width="34" height="28" rx="6" fill="#AEDBD2" />
        <rect x="172" y="20" width="26" height="24" rx="6" fill="#AEDBD2" />
        <rect x="182" y="92" width="40" height="30" rx="6" fill="#AEDBD2" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative flex items-center justify-center">
          <span className="absolute rounded-full animate-ping" style={{ width: 26, height: 26, backgroundColor: palette.teal, opacity: 0.35 }} />
          <span className="relative rounded-full border-2 border-white shadow" style={{ width: 14, height: 14, backgroundColor: palette.teal }} />
        </div>
      </div>
      <div className="absolute bottom-2 left-2 right-2 rounded-xl px-3 py-2 flex items-center gap-2" style={{ backgroundColor: "rgba(255,255,255,0.92)" }}>
        <MapPin size={14} style={{ color: palette.tealText }} />
        <div className="min-w-0">
          <p className="text-xs font-bold truncate" style={{ color: palette.ink }}>
            {label} · {address}
          </p>
          <p className="text-xs" style={{ color: palette.inkSoft }}>
            Обновлено {updatedAgo}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   РОДИТЕЛЬСКИЙ ДАШБОРД
   ============================================================ */

function TopAppsList({ apps }) {
  return (
    <div className="flex-1 w-full space-y-3">
      <p className="text-sm font-bold" style={{ color: palette.inkSoft }}>
        Топ-3 приложения сегодня
      </p>
      {apps.map((app, i) => (
        <div key={app.id} className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0" style={{ backgroundColor: app.soft, color: app.color }}>
            {i + 1}
          </span>
          <span className="flex-1 text-sm font-semibold truncate" style={{ color: palette.ink }}>
            {app.name}
          </span>
          <span className="text-sm font-bold shrink-0" style={{ color: palette.inkSoft }}>
            {formatDuration(app.minutes)}
          </span>
        </div>
      ))}
    </div>
  );
}

function CategoryBreakdown({ data }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.minutes), 1);
  return (
    <Card className="mt-4">
      <SectionHeading title="Экранное время по категориям" subtitle="Сегодня" icon={TrendingUp} />
      <div className="space-y-4">
        {data.map((d) => (
          <div key={d.id}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-semibold" style={{ color: palette.ink }}>
                {d.name}
              </span>
              <span className="text-sm font-bold" style={{ color: palette.inkSoft }}>
                {formatDuration(d.minutes)}
              </span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: palette.bg }}>
              <div className="h-full rounded-full" style={{ width: `${(d.minutes / max) * 100}%`, backgroundColor: d.color, transition: "width 0.7s ease" }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StatusMapCard({ status, location }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.online;
  const Icon = cfg.icon;
  return (
    <Card>
      <SectionHeading title="Сейчас" icon={MapPin} />
      <div className="flex items-center gap-2 mb-4">
        <span className="relative flex items-center justify-center" style={{ width: 12, height: 12 }}>
          <span className="absolute rounded-full animate-ping" style={{ width: 12, height: 12, backgroundColor: cfg.color, opacity: 0.6 }} />
          <span className="relative rounded-full" style={{ width: 10, height: 10, backgroundColor: cfg.color }} />
        </span>
        <Badge color={cfg.text} soft={cfg.soft}>
          <Icon size={13} />
          {cfg.label}
        </Badge>
      </div>
      {location ? (
        <MiniMap label={location.label} address={location.address} updatedAgo={formatRelativeTime(location.updated_at)} />
      ) : (
        <MiniMap />
      )}
    </Card>
  );
}

function OverviewSection({ usedMinutes, limitMinutes, bonusMinutes, status, topApps, categoryBreakdown, location }) {
  const totalAvailable = limitMinutes + bonusMinutes;
  return (
    <section>
      <SectionHeading title="Обзор дня" subtitle="Экранное время ребёнка сегодня" icon={Clock} />
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="md:col-span-3">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <RadialProgress value={usedMinutes} max={totalAvailable} color={palette.teal} trackColor={palette.bg}>
              <div className="text-center">
                <p className="text-2xl font-extrabold" style={{ ...displayFont, color: palette.ink }}>
                  {formatDuration(usedMinutes)}
                </p>
                <p className="text-xs" style={{ color: palette.inkSoft }}>
                  из {formatDuration(totalAvailable)}
                </p>
              </div>
            </RadialProgress>
            {topApps && topApps.length > 0 ? (
              <TopAppsList apps={topApps} />
            ) : (
              <p className="text-sm flex-1" style={{ color: palette.inkSoft }}>
                Пока нет данных об использовании приложений сегодня.
              </p>
            )}
          </div>
        </Card>
        <div className="md:col-span-2">
          <StatusMapCard status={status} location={location} />
        </div>
      </div>
      <CategoryBreakdown data={categoryBreakdown} />
    </section>
  );
}

function AlertCard({ alert, onMarkDiscussed }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = LEVEL_CONFIG[alert.level];
  const Icon = cfg.icon;
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: cfg.soft, color: cfg.text }}>
          <Icon size={19} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <h3 className="font-extrabold text-sm sm:text-base" style={{ color: palette.ink }}>
              {alert.title}
            </h3>
            <Badge color={cfg.text} soft={cfg.soft}>
              {cfg.label} · {alert.risk}%
            </Badge>
          </div>
          <p className="text-sm mt-1" style={{ color: palette.inkSoft }}>
            {alert.description}
          </p>
          <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: palette.inkSoft }}>
            <span>{alert.time}</span>
            <span>·</span>
            <span>{alert.app}</span>
          </div>

          {expanded && (
            <div className="mt-3 rounded-2xl p-3 text-sm" style={{ backgroundColor: palette.bg, color: palette.ink }}>
              ИИ-помощник оценивает риск по тону и характеру переписки, не показывая вам полный текст сообщений — это помогает
              оставаться в курсе, не читая личную переписку ребёнка. Лучший следующий шаг — спокойный разговор напрямую.
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
            <SecondaryButton onClick={() => setExpanded((v) => !v)} icon={Eye}>
              {expanded ? "Скрыть детали" : "Посмотреть детали"}
            </SecondaryButton>
            <PrimaryButton
              onClick={() => onMarkDiscussed(alert.id)}
              disabled={alert.discussed}
              icon={alert.discussed ? Check : MessageSquare}
              style={{ backgroundColor: alert.discussed ? palette.inkSoft : palette.teal }}
            >
              {alert.discussed ? "Обсудили" : "Обсудить с ребёнком"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </Card>
  );
}

function AlertsSection({ alerts, onMarkDiscussed }) {
  return (
    <section>
      <SectionHeading title="ИИ-аналитика и уведомления" subtitle="Спокойный помощник следит за безопасностью, а не за каждым кликом" icon={Sparkles} />
      {alerts.length === 0 ? (
        <Card>
          <p className="text-sm text-center py-4" style={{ color: palette.inkSoft }}>
            Нет новых уведомлений — всё спокойно 😊
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <AlertCard key={a.id} alert={a} onMarkDiscussed={onMarkDiscussed} />
          ))}
        </div>
      )}
    </section>
  );
}

function AddScheduleBlockForm({ onAddBlock }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [blockType, setBlockType] = useState("other");
  const [startTime, setStartTime] = useState("16:00");
  const [endTime, setEndTime] = useState("17:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = label.trim().length >= 2 && startTime && endTime;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError("");
    try {
      await onAddBlock({ label: label.trim(), blockType, startTime, endTime });
      setLabel("");
      setBlockType("other");
      setStartTime("16:00");
      setEndTime("17:00");
      setOpen(false);
    } catch (err) {
      setError(err.message || "Не получилось добавить блок");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-bold border-2 border-dashed mt-1"
        style={{ borderColor: palette.border, color: palette.inkSoft }}
      >
        <Clock size={16} /> Добавить блок расписания
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-3 mt-1 border-t" style={{ borderColor: palette.border }}>
      {error && (
        <div className="rounded-2xl p-3 text-sm font-semibold" style={{ backgroundColor: palette.roseSoft, color: palette.roseText }}>
          {error}
        </div>
      )}
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Название, например «Кружок английского»"
        className="field-focus w-full rounded-2xl px-3 py-2.5 text-sm border"
        style={{ borderColor: palette.border, color: palette.ink }}
      />
      <select
        value={blockType}
        onChange={(e) => setBlockType(e.target.value)}
        className="field-focus w-full rounded-2xl px-3 py-2.5 text-sm border"
        style={{ borderColor: palette.border, color: palette.ink }}
      >
        <option value="study">Учёба</option>
        <option value="sleep">Сон</option>
        <option value="other">Другое</option>
      </select>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold block mb-1" style={{ color: palette.inkSoft }}>
            Начало
          </label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="field-focus w-full rounded-2xl px-3 py-2.5 text-sm border"
            style={{ borderColor: palette.border, color: palette.ink }}
          />
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1" style={{ color: palette.inkSoft }}>
            Конец
          </label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="field-focus w-full rounded-2xl px-3 py-2.5 text-sm border"
            style={{ borderColor: palette.border, color: palette.ink }}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <PrimaryButton onClick={handleSubmit} disabled={busy || !canSubmit} className="flex-1">
          {busy ? "Добавляем…" : "Добавить"}
        </PrimaryButton>
        <SecondaryButton onClick={() => setOpen(false)}>Отмена</SecondaryButton>
      </div>
    </form>
  );
}

function TimeManagementSection({ limitMinutes, setLimitMinutes, schedule, onToggleBlock, onAddBlock }) {
  const pct = ((limitMinutes - 30) / (360 - 30)) * 100;
  return (
    <section>
      <SectionHeading title="Управление лимитами" subtitle="Настройте баланс между экраном и остальной жизнью" icon={ShieldCheck} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <p className="text-sm font-bold mb-1" style={{ color: palette.ink }}>
            Дневной лимит развлечений
          </p>
          <p className="text-3xl font-extrabold mb-4" style={{ ...displayFont, color: palette.tealText }}>
            {formatDuration(limitMinutes)}
          </p>
          <input
            type="range"
            min={30}
            max={360}
            step={15}
            value={limitMinutes}
            onChange={(e) => setLimitMinutes(Number(e.target.value))}
            className="w-full range-slider"
            style={{ background: `linear-gradient(to right, ${palette.teal} ${pct}%, ${palette.border} ${pct}%)` }}
          />
          <div className="flex justify-between text-xs mt-2" style={{ color: palette.inkSoft }}>
            <span>30 мин</span>
            <span>6 часов</span>
          </div>
          <p className="text-xs mt-4 rounded-xl p-3" style={{ backgroundColor: palette.tealSoft, color: palette.tealText }}>
            Изменения применяются мгновенно — ребёнок сразу увидит новое доступное время.
          </p>
        </Card>
        <Card>
          <p className="text-sm font-bold mb-3" style={{ color: palette.ink }}>
            Расписание блокировок
          </p>
          <div className="space-y-3">
            {schedule.map((block) => {
              const BlockIcon = block.icon;
              return (
                <div key={block.id} className="flex items-center gap-3 rounded-2xl p-3" style={{ backgroundColor: palette.bg }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "white", color: block.color }}>
                    <BlockIcon size={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold" style={{ color: palette.ink }}>
                      {block.label}
                    </p>
                    <p className="text-xs" style={{ color: palette.inkSoft }}>
                      {block.start} – {block.end}
                    </p>
                  </div>
                  <ToggleSwitch checked={block.active} activeColor={block.color} onChange={(val) => onToggleBlock(block.id, val)} />
                </div>
              );
            })}
          </div>
          <AddScheduleBlockForm onAddBlock={onAddBlock} />
        </Card>
      </div>
    </section>
  );
}

function RequestCard({ request, onRespond }) {
  const [comment, setComment] = useState("");
  const TypeIcon = request.type === "quest" ? Award : request.type === "unlock" ? Unlock : Clock;
  const introText = request.type === "quest" ? "Ребёнок выполнил квест и просит награду" : "Ребёнок просит";
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center font-extrabold shrink-0" style={{ backgroundColor: palette.coralSoft, color: palette.coralText }}>
          <Sparkles size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-bold text-sm" style={{ color: palette.ink }}>
              {introText}
            </p>
            <span className="text-xs" style={{ color: palette.inkSoft }}>
              {request.createdAt}
            </span>
          </div>
          <div className="mt-1.5">
            <Badge color={palette.coralText} soft={palette.coralSoft}>
              <TypeIcon size={13} />
              {request.label}
            </Badge>
          </div>
          <p className="text-sm mt-2 italic" style={{ color: palette.inkSoft }}>
            «{request.reason}»
          </p>

          <input
            type="text"
            placeholder="Комментарий (необязательно)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="field-focus w-full mt-3 rounded-xl px-3 py-2 text-sm border"
            style={{ borderColor: palette.border, color: palette.ink }}
          />

          <div className="flex gap-2 mt-3">
            <PrimaryButton icon={CheckCircle2} onClick={() => onRespond(request.id, "approved", comment)} className="flex-1">
              Одобрить
            </PrimaryButton>
            <SecondaryButton icon={XCircle} onClick={() => onRespond(request.id, "declined", comment)} className="flex-1">
              Отклонить
            </SecondaryButton>
          </div>
        </div>
      </div>
    </Card>
  );
}

function RequestCenterSection({ requests, history, onRespond }) {
  const pending = requests.filter((r) => r.status === "pending");
  return (
    <section>
      <SectionHeading
        title="Центр запросов"
        subtitle="Входящие запросы от ребёнка"
        icon={Bell}
        right={pending.length > 0 && (
          <Badge color={palette.coralText} soft={palette.coralSoft}>
            {pending.length} ожидают
          </Badge>
        )}
      />
      {pending.length === 0 ? (
        <Card>
          <p className="text-sm text-center py-4" style={{ color: palette.inkSoft }}>
            Пока нет новых запросов — здесь появятся просьбы ребёнка о доп. времени или выполненных квестах ✨
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {pending.map((r) => (
            <RequestCard key={r.id} request={r} onRespond={onRespond} />
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-bold mb-2" style={{ color: palette.inkSoft }}>
            Недавние решения
          </p>
          <div className="space-y-2">
            {history.slice(0, 4).map((h) => (
              <div key={h.id} className="flex items-center gap-3 rounded-2xl p-3" style={{ backgroundColor: palette.bg }}>
                {h.kind === "approved" ? (
                  <CheckCircle2 size={16} className="shrink-0" style={{ color: palette.tealText }} />
                ) : (
                  <XCircle size={16} className="shrink-0" style={{ color: palette.roseText }} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate" style={{ color: palette.ink }}>
                    {h.text}
                  </p>
                  {h.comment && (
                    <p className="text-xs truncate" style={{ color: palette.inkSoft }}>
                      {h.comment}
                    </p>
                  )}
                </div>
                <span className="text-xs shrink-0" style={{ color: palette.inkSoft }}>
                  {h.time}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function AddChildCard({ onAddChild }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const canSubmit = name && email && password.length >= 8;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError("");
    try {
      await onAddChild({ name, email, password });
      setDone(true);
      setName("");
      setEmail("");
      setPassword("");
    } catch (err) {
      setError(err.message || "Не получилось добавить ребёнка");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Card>
        <button onClick={() => setOpen(true)} className="w-full flex items-center justify-between text-left">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: palette.tealSoft, color: palette.tealText }}>
              <Users size={17} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: palette.ink }}>
                Добавить ребёнка
              </p>
              <p className="text-xs" style={{ color: palette.inkSoft }}>
                Создать отдельный вход для ребёнка в этой семье
              </p>
            </div>
          </div>
          <ChevronRight size={18} style={{ color: palette.inkSoft }} />
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeading title="Добавить ребёнка" icon={Users} />
      {done && (
        <div className="mb-3 rounded-2xl p-3 flex items-center gap-2" style={{ backgroundColor: palette.tealSoft, color: palette.tealText }}>
          <CheckCircle2 size={18} />
          <p className="text-sm font-bold">Аккаунт создан — можно входить под этим email</p>
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-2xl p-3 text-sm font-semibold" style={{ backgroundColor: palette.roseSoft, color: palette.roseText }}>
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Имя ребёнка"
          className="field-focus w-full rounded-2xl px-3 py-2.5 text-sm border"
          style={{ borderColor: palette.border, color: palette.ink }}
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email для входа"
          className="field-focus w-full rounded-2xl px-3 py-2.5 text-sm border"
          style={{ borderColor: palette.border, color: palette.ink }}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль (минимум 8 символов)"
          className="field-focus w-full rounded-2xl px-3 py-2.5 text-sm border"
          style={{ borderColor: palette.border, color: palette.ink }}
        />
        <div className="flex gap-2">
          <PrimaryButton onClick={handleSubmit} disabled={busy || !canSubmit} className="flex-1">
            {busy ? "Добавляем…" : "Добавить"}
          </PrimaryButton>
          <SecondaryButton onClick={() => setOpen(false)}>Свернуть</SecondaryButton>
        </div>
      </form>
    </Card>
  );
}
function ParentQuestRow({ quest }) {
  const statusConfig = {
    available: { label: "Доступен", color: palette.tealText, soft: palette.tealSoft },
    pending_review: { label: "На проверке", color: palette.amberText, soft: palette.amberSoft },
    completed: { label: "Выполнен", color: palette.inkSoft, soft: palette.border },
  };
  const cfg = statusConfig[quest.status] || statusConfig.available;
  return (
    <div className="flex items-center gap-3 rounded-2xl p-3" style={{ backgroundColor: palette.bg }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "white", color: palette.lavenderText }}>
        <Award size={17} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate" style={{ color: palette.ink }}>
          {quest.title}
        </p>
        <p className="text-xs" style={{ color: palette.inkSoft }}>
          +{quest.reward} мин
        </p>
      </div>
      <Badge color={cfg.color} soft={cfg.soft}>{cfg.label}</Badge>
    </div>
  );
}

function AddQuestCard({ onAddQuest }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rewardMinutes, setRewardMinutes] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = title.trim().length >= 2 && Number(rewardMinutes) > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError("");
    try {
      await onAddQuest({ title: title.trim(), description: description.trim(), rewardMinutes: Number(rewardMinutes) });
      setTitle("");
      setDescription("");
      setRewardMinutes(15);
      setOpen(false);
    } catch (err) {
      setError(err.message || "Не получилось создать квест");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Card>
        <button onClick={() => setOpen(true)} className="w-full flex items-center justify-between text-left">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: palette.lavenderSoft, color: palette.lavenderText }}>
              <Award size={17} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: palette.ink }}>
                Добавить квест
              </p>
              <p className="text-xs" style={{ color: palette.inkSoft }}>
                Новое задание с наградой в минутах экрана
              </p>
            </div>
          </div>
          <ChevronRight size={18} style={{ color: palette.inkSoft }} />
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeading title="Новый квест" icon={Award} />
      {error && (
        <div className="mb-3 rounded-2xl p-3 text-sm font-semibold" style={{ backgroundColor: palette.roseSoft, color: palette.roseText }}>
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название, например «Помыть посуду»"
          className="field-focus w-full rounded-2xl px-3 py-2.5 text-sm border"
          style={{ borderColor: palette.border, color: palette.ink }}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Описание — необязательно"
          rows={2}
          className="field-focus w-full rounded-2xl px-3 py-2.5 text-sm border resize-none"
          style={{ borderColor: palette.border, color: palette.ink }}
        />
        <div>
          <label className="text-xs font-semibold block mb-1" style={{ color: palette.inkSoft }}>
            Награда, минут экранного времени
          </label>
          <input
            type="number"
            min={1}
            max={300}
            value={rewardMinutes}
            onChange={(e) => setRewardMinutes(e.target.value)}
            className="field-focus w-full rounded-2xl px-3 py-2.5 text-sm border"
            style={{ borderColor: palette.border, color: palette.ink }}
          />
        </div>
        <div className="flex gap-2">
          <PrimaryButton onClick={handleSubmit} disabled={busy || !canSubmit} className="flex-1">
            {busy ? "Создаём…" : "Создать квест"}
          </PrimaryButton>
          <SecondaryButton onClick={() => setOpen(false)}>Свернуть</SecondaryButton>
        </div>
      </form>
    </Card>
  );
}

function QuestManagementSection({ quests, onAddQuest }) {
  return (
    <section>
      <SectionHeading title="Квесты" subtitle="Задания, за которые ребёнок получает дополнительное время" icon={Award} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <p className="text-sm font-bold mb-3" style={{ color: palette.ink }}>
            Текущие квесты
          </p>
          <div className="space-y-3">
            {quests.map((q) => (
              <ParentQuestRow key={q.id} quest={q} />
            ))}
            {quests.length === 0 && (
              <p className="text-sm text-center py-2" style={{ color: palette.inkSoft }}>
                Квестов пока нет — добавьте первый
              </p>
            )}
          </div>
        </Card>
        <AddQuestCard onAddQuest={onAddQuest} />
      </div>
    </section>
  );
}
function ParentDashboard({ state, actions }) {
  return (
    <div className="space-y-8">
      <OverviewSection
        usedMinutes={state.usedMinutes}
        limitMinutes={state.limitMinutes}
        bonusMinutes={state.bonusMinutes}
        status={state.status}
        topApps={state.topApps}
        categoryBreakdown={state.categoryBreakdown}
        location={state.location}
      />
      <AlertsSection alerts={state.alerts} onMarkDiscussed={actions.markAlertDiscussed} />
      <TimeManagementSection
        limitMinutes={state.limitMinutes}
        setLimitMinutes={actions.setLimitMinutes}
        schedule={state.schedule}
        onToggleBlock={actions.toggleScheduleBlock}
        onAddBlock={actions.createScheduleBlock}
      />
      <QuestManagementSection quests={state.quests} onAddQuest={actions.createQuest} />
      <RequestCenterSection requests={state.requests} history={state.history} onRespond={actions.respondToRequest} />
      <AddChildCard onAddChild={actions.addChild} />
    </div>
  );
}

/* ============================================================
   ДЕТСКИЙ ДАШБОРД
   ============================================================ */

function MyTimeHero({ usedMinutes, limitMinutes, bonusMinutes }) {
  const total = limitMinutes + bonusMinutes;
  const remaining = Math.max(total - usedMinutes, 0);
  const isDone = remaining <= 0;
  const message = isDone ? "Время для отдыха от экрана 🌙" : remaining <= 15 ? "Осталось совсем немного — успей закончить дела!" : "Ещё много времени, чтобы поиграть и посмотреть видео 🎮";
  return (
    <Card className="text-center py-8">
      <p className="text-sm font-bold mb-4" style={{ color: palette.inkSoft }}>
        Моё время сегодня
      </p>
      <div className="flex justify-center">
        <RadialProgress value={remaining} max={total || 1} size={200} strokeWidth={18} color={isDone ? palette.lavender : palette.teal} trackColor={palette.bg}>
          <div className="text-center">
            <p className="text-4xl font-extrabold" style={{ ...displayFont, color: palette.ink }}>
              {formatDuration(remaining)}
            </p>
            <p className="text-xs mt-1" style={{ color: palette.inkSoft }}>
              осталось
            </p>
          </div>
        </RadialProgress>
      </div>
      <p className="mt-5 text-sm font-semibold" style={{ color: palette.ink }}>
        {message}
      </p>
      {bonusMinutes > 0 && (
        <div className="inline-flex mt-3">
          <Badge color={palette.tealText} soft={palette.tealSoft}>
            <Star size={13} /> +{bonusMinutes} мин заработано квестами
          </Badge>
        </div>
      )}
    </Card>
  );
}

function QuestCard({ quest, onSubmit }) {
  const Icon = quest.icon;
  const isAvailable = quest.status === "available";
  const isPending = quest.status === "pending_review";
  const isDone = quest.status === "completed";
  return (
    <Card style={isDone ? { backgroundColor: palette.tealSoft, borderColor: "transparent" } : {}}>
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: isDone ? "white" : palette.lavenderSoft, color: isDone ? palette.tealText : palette.lavenderText }}
        >
          {isDone ? <Check size={20} /> : <Icon size={20} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-extrabold text-sm sm:text-base" style={{ color: palette.ink }}>
              {quest.title}
            </h3>
            <Badge color={palette.tealText} soft={palette.tealSoft}>
              +{quest.reward} мин
            </Badge>
          </div>
          <p className="text-sm mt-1" style={{ color: palette.inkSoft }}>
            {quest.description}
          </p>

          <div className="mt-3">
            {isAvailable && (
              <PrimaryButton icon={Send} onClick={() => onSubmit(quest.id)}>
                Запросить проверку у родителя
              </PrimaryButton>
            )}
            {isPending && (
              <span className="inline-flex items-center gap-2 text-sm font-bold rounded-2xl px-4 py-2.5" style={{ backgroundColor: palette.amberSoft, color: palette.amberText }}>
                <Clock size={16} /> Ожидает одобрения
              </span>
            )}
            {isDone && (
              <span className="inline-flex items-center gap-2 text-sm font-bold" style={{ color: palette.tealText }}>
                <PartyPopper size={16} /> Выполнено! Награда получена
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function QuestsSection({ quests, streak, earnedToday, onSubmitQuest }) {
  const availableCount = quests.filter((q) => q.status === "available").length;
  return (
    <section>
      <SectionHeading title="Квесты и цифровой баланс" subtitle="Заработай дополнительное время полезными делами" icon={Award} />
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card className="text-center py-4">
          <div className="flex items-center justify-center gap-1.5">
            <Flame size={18} style={{ color: palette.coralText }} />
            <span className="text-2xl font-extrabold" style={{ ...displayFont, color: palette.ink }}>
              {streak}
            </span>
          </div>
          <p className="text-xs mt-1" style={{ color: palette.inkSoft }}>
            дня подряд
          </p>
        </Card>
        <Card className="text-center py-4">
          <div className="flex items-center justify-center gap-1.5">
            <Star size={18} style={{ color: palette.tealText }} />
            <span className="text-2xl font-extrabold" style={{ ...displayFont, color: palette.ink }}>
              +{earnedToday}
            </span>
          </div>
          <p className="text-xs mt-1" style={{ color: palette.inkSoft }}>
            минут заработано сегодня
          </p>
        </Card>
      </div>
      <div className="space-y-3">
        {quests.map((q) => (
          <QuestCard key={q.id} quest={q} onSubmit={onSubmitQuest} />
        ))}
        {availableCount === 0 && (
          <Card>
            <p className="text-sm text-center py-2" style={{ color: palette.inkSoft }}>
              Все квесты на сегодня выполнены — ты молодец! 🎉
            </p>
          </Card>
        )}
      </div>
    </section>
  );
}

function AskForMoreSection({ onSubmitRequest }) {
  const [type, setType] = useState("time");
  const [minutes, setMinutes] = useState(15);
  const [target, setTarget] = useState("TikTok");
  const [reason, setReason] = useState("");
  const [justSent, setJustSent] = useState(false);

  const [sendError, setSendError] = useState("");

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setSendError("");
    try {
      await onSubmitRequest({
        type,
        amount: type === "time" ? minutes : null,
        label: type === "time" ? `Доп. ${minutes} минут` : `Разблокировать «${target}»`,
        reason: reason.trim(),
      });
      setJustSent(true);
      setReason("");
      setTimeout(() => setJustSent(false), 4000);
    } catch (err) {
      setSendError(err.message || "Не получилось отправить запрос");
    }
  };

  return (
    <section>
      <SectionHeading title="Попросить больше" subtitle="Отправь родителям короткий запрос" icon={Send} />
      <Card>
        {justSent && (
          <div className="mb-4 rounded-2xl p-3 flex items-center gap-2" style={{ backgroundColor: palette.tealSoft, color: palette.tealText }}>
            <CheckCircle2 size={18} />
            <p className="text-sm font-bold">Запрос отправлен! Ожидай ответа родителей ⏳</p>
          </div>
        )}
        {sendError && (
          <div className="mb-4 rounded-2xl p-3 flex items-center gap-2" style={{ backgroundColor: palette.roseSoft, color: palette.roseText }}>
            <XCircle size={18} />
            <p className="text-sm font-bold">{sendError}</p>
          </div>
        )}

        <p className="text-xs font-bold mb-2" style={{ color: palette.inkSoft }}>
          Что тебе нужно?
        </p>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setType("time")}
            className="flex-1 rounded-2xl py-2.5 text-sm font-bold"
            style={{ backgroundColor: type === "time" ? palette.teal : palette.bg, color: type === "time" ? "white" : palette.inkSoft, transition: "background-color 0.15s ease" }}
          >
            Доп. время
          </button>
          <button
            onClick={() => setType("unlock")}
            className="flex-1 rounded-2xl py-2.5 text-sm font-bold"
            style={{ backgroundColor: type === "unlock" ? palette.teal : palette.bg, color: type === "unlock" ? "white" : palette.inkSoft, transition: "background-color 0.15s ease" }}
          >
            Разблокировать сайт
          </button>
        </div>

        {type === "time" ? (
          <div className="flex gap-2 mb-4">
            {[15, 30, 60].map((m) => (
              <button
                key={m}
                onClick={() => setMinutes(m)}
                className="flex-1 rounded-2xl py-2.5 text-sm font-bold border"
                style={{
                  borderColor: minutes === m ? palette.teal : palette.border,
                  backgroundColor: minutes === m ? palette.tealSoft : "white",
                  color: minutes === m ? palette.tealText : palette.ink,
                }}
              >
                +{m} мин
              </button>
            ))}
          </div>
        ) : (
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="field-focus w-full mb-4 rounded-2xl px-3 py-2.5 text-sm border" style={{ borderColor: palette.border, color: palette.ink }}>
            {["TikTok", "YouTube", "Discord", "Instagram"].map((app) => (
              <option key={app} value={app}>
                {app}
              </option>
            ))}
          </select>
        )}

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Почему это важно? Например: «Мне нужно дописать проект»"
          rows={3}
          className="field-focus w-full rounded-2xl px-3 py-2.5 text-sm border resize-none"
          style={{ borderColor: palette.border, color: palette.ink }}
        />

        <div className="mt-4">
          <PrimaryButton icon={Send} onClick={handleSubmit} disabled={!reason.trim()} className="w-full">
            Отправить запрос родителям
          </PrimaryButton>
        </div>
      </Card>
    </section>
  );
}

function ResponseHistorySection({ history }) {
  if (history.length === 0) return null;
  return (
    <section>
      <SectionHeading title="Ответы родителей" subtitle="Прозрачно — ты всегда видишь решение и причину" icon={Heart} />
      <div className="space-y-2">
        {history.slice(0, 4).map((h) => (
          <Card key={h.id} className="py-3">
            <div className="flex items-center gap-3">
              {h.kind === "approved" ? (
                <CheckCircle2 size={18} className="shrink-0" style={{ color: palette.tealText }} />
              ) : (
                <XCircle size={18} className="shrink-0" style={{ color: palette.roseText }} />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold" style={{ color: palette.ink }}>
                  {h.text}
                </p>
                {h.comment && (
                  <p className="text-xs mt-0.5" style={{ color: palette.inkSoft }}>
                    {h.comment}
                  </p>
                )}
              </div>
              <span className="text-xs shrink-0" style={{ color: palette.inkSoft }}>
                {h.time}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

function ChildDashboard({ state, actions }) {
  return (
    <div className="space-y-8">
      <MyTimeHero usedMinutes={state.usedMinutes} limitMinutes={state.limitMinutes} bonusMinutes={state.bonusMinutes} />
      <QuestsSection quests={state.quests} streak={state.streak} earnedToday={state.bonusMinutes} onSubmitQuest={actions.submitQuest} />
      <AskForMoreSection onSubmitRequest={actions.submitRequest} />
      <ResponseHistorySection history={state.history} />
    </div>
  );
}

/* ============================================================
   ШАПКА
   ============================================================ */

function Header({ user, onLogout }) {
  const isParent = user.role === "parent";
  return (
    <header className="sticky top-0 z-10" style={{ backgroundColor: "rgba(246,247,241,0.9)", borderBottom: `1px solid ${palette.border}` }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <TrustMark size={38} />
          <div className="hidden sm:block">
            <p className="font-extrabold leading-tight" style={{ ...displayFont, color: palette.ink }}>
              Вместе
            </p>
            <p className="text-xs leading-tight" style={{ color: palette.inkSoft }}>
              доверие вместо слежки
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 rounded-full px-3 py-1.5"
            style={{ backgroundColor: isParent ? palette.tealSoft : palette.coralSoft, color: isParent ? palette.tealText : palette.coralText }}
          >
            {isParent ? <Users size={15} /> : <Sparkles size={15} />}
            <span className="text-sm font-bold">{user.name}</span>
          </div>
          <SecondaryButton onClick={onLogout}>Выйти</SecondaryButton>
        </div>
      </div>
    </header>
  );
}

/* ============================================================
   ЭКРАН ВХОДА
   ============================================================ */

function LoginScreen({ onLogin, onGoToRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password || busy) return;
    setBusy(true);
    setError("");
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err.message || "Не получилось войти");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: palette.bg, fontFamily: "'Nunito', ui-sans-serif, system-ui, sans-serif" }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=Unbounded:wght@600;700;800;900&display=swap');`}</style>
      <Card className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <TrustMark size={48} />
          <h1 className="mt-3 text-xl font-extrabold" style={{ ...displayFont, color: palette.ink }}>
            Вместе
          </h1>
          <p className="text-sm mt-1" style={{ color: palette.inkSoft }}>
            Войдите в свой аккаунт
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl p-3 text-sm font-semibold" style={{ backgroundColor: palette.roseSoft, color: palette.roseText }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="field-focus w-full rounded-2xl px-3 py-2.5 text-sm border"
            style={{ borderColor: palette.border, color: palette.ink }}
            autoComplete="username"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль"
            className="field-focus w-full rounded-2xl px-3 py-2.5 text-sm border"
            style={{ borderColor: palette.border, color: palette.ink }}
            autoComplete="current-password"
          />
          <PrimaryButton onClick={handleSubmit} disabled={busy || !email || !password} className="w-full">
            {busy ? "Входим…" : "Войти"}
          </PrimaryButton>
        </form>

        <div className="mt-5 pt-4 text-center" style={{ borderTop: `1px solid ${palette.border}` }}>
          <p className="text-sm" style={{ color: palette.inkSoft }}>
            Ещё нет аккаунта?{" "}
            <button onClick={onGoToRegister} className="font-bold underline" style={{ color: palette.tealText }}>
              Создать семью
            </button>
          </p>
        </div>
      </Card>
    </div>
  );
}

function RegisterScreen({ onRegister, onGoToLogin }) {
  const [familyName, setFamilyName] = useState("");
  const [parentName, setParentName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = parentName && email && password.length >= 8;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError("");
    try {
      await onRegister({ familyName, parentName, email, password });
    } catch (err) {
      setError(err.message || "Не получилось создать семью");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: palette.bg, fontFamily: "'Nunito', ui-sans-serif, system-ui, sans-serif" }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=Unbounded:wght@600;700;800;900&display=swap');`}</style>
      <Card className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <TrustMark size={48} />
          <h1 className="mt-3 text-xl font-extrabold" style={{ ...displayFont, color: palette.ink }}>
            Создать семью
          </h1>
          <p className="text-sm mt-1" style={{ color: palette.inkSoft }}>
            Это создаст ваш родительский аккаунт — ребёнка добавите следующим шагом
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl p-3 text-sm font-semibold" style={{ backgroundColor: palette.roseSoft, color: palette.roseText }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder="Название семьи (необязательно)"
            className="field-focus w-full rounded-2xl px-3 py-2.5 text-sm border"
            style={{ borderColor: palette.border, color: palette.ink }}
          />
          <input
            type="text"
            value={parentName}
            onChange={(e) => setParentName(e.target.value)}
            placeholder="Ваше имя"
            className="field-focus w-full rounded-2xl px-3 py-2.5 text-sm border"
            style={{ borderColor: palette.border, color: palette.ink }}
            autoComplete="name"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="field-focus w-full rounded-2xl px-3 py-2.5 text-sm border"
            style={{ borderColor: palette.border, color: palette.ink }}
            autoComplete="username"
          />
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль (минимум 8 символов)"
              className="field-focus w-full rounded-2xl px-3 py-2.5 text-sm border"
              style={{ borderColor: palette.border, color: palette.ink }}
              autoComplete="new-password"
            />
            {password && password.length < 8 && (
              <p className="text-xs mt-1 px-1" style={{ color: palette.roseText }}>
                Ещё {8 - password.length} симв. до минимума
              </p>
            )}
          </div>
          <PrimaryButton onClick={handleSubmit} disabled={busy || !canSubmit} className="w-full">
            {busy ? "Создаём…" : "Создать семью"}
          </PrimaryButton>
        </form>

        <div className="mt-5 pt-4 text-center" style={{ borderTop: `1px solid ${palette.border}` }}>
          <p className="text-sm" style={{ color: palette.inkSoft }}>
            Уже есть аккаунт?{" "}
            <button onClick={onGoToLogin} className="font-bold underline" style={{ color: palette.tealText }}>
              Войти
            </button>
          </p>
        </div>
      </Card>
    </div>
  );
}

/* ============================================================
   КОРНЕВОЙ КОМПОНЕНТ
   ============================================================ */

export default function App() {
  const [authMode, setAuthMode] = useState("login"); // "login" | "register"
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [wakingUp, setWakingUp] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [overview, setOverview] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [quests, setQuests] = useState([]);
  const [requests, setRequests] = useState([]);
  const [history, setHistory] = useState([]);
  const [location, setLocation] = useState(null);

  const limitDebounceRef = useRef(null);

  const loadAll = async (authToken, role) => {
    setLoadError(null);
    // Render free засыпает после простоя — первый запрос может идти до минуты.
    const wakeTimer = setTimeout(() => setWakingUp(true), 2500);
    try {
      const calls = [
        apiFetch("/api/overview", { token: authToken }),
        apiFetch("/api/settings", { token: authToken }),
        apiFetch("/api/quests", { token: authToken }),
        apiFetch("/api/requests", { token: authToken }),
        apiFetch("/api/history", { token: authToken }),
        apiFetch("/api/location", { token: authToken }),
      ];
      if (role === "parent") calls.push(apiFetch("/api/alerts", { token: authToken }));

      const [overviewData, settingsData, questsData, requestsData, historyData, locationData, alertsData] =
        await Promise.all(calls);

      setOverview(mapOverview(overviewData));
      setSchedule(mapSchedule(settingsData.schedule));
      setQuests(mapQuests(questsData.quests));
      setRequests(mapRequests(requestsData.requests));
      setHistory(mapHistory(historyData.history));
      setLocation(locationData.location);
      if (role === "parent") setAlerts(mapAlerts(alertsData.alerts));
    } catch (err) {
      setLoadError(err.message || "Не удалось загрузить данные с сервера");
    } finally {
      clearTimeout(wakeTimer);
      setWakingUp(false);
    }
  };

  const handleLogin = async (email, password) => {
    // Тут намеренно без try/catch — LoginScreen сам ловит ошибку и показывает её.
    const data = await apiFetch("/api/auth/login", { method: "POST", body: { email, password } });
    setToken(data.token);
    setUser(data.user);
    setLoading(true);
    await loadAll(data.token, data.user.role);
    setLoading(false);
  };

  const handleRegister = async ({ familyName, parentName, email, password }) => {
    // Тоже без try/catch — RegisterScreen сам ловит ошибку.
    const data = await apiFetch("/api/auth/register", {
      method: "POST",
      body: { familyName, parentName, email, password },
    });
    setToken(data.token);
    setUser(data.user);
    setLoading(true);
    await loadAll(data.token, data.user.role);
    setLoading(false);
  };

  const handleAddChild = async ({ name, email, password }) => {
    // Без try/catch — AddChildCard сам ловит ошибку и показывает её в форме.
    await apiFetch("/api/auth/register-child", { method: "POST", token, body: { name, email, password } });
  };

  const handleLogout = () => {
    setAuthMode("login");
    setToken(null);
    setUser(null);
    setOverview(null);
    setSchedule([]);
    setAlerts([]);
    setQuests([]);
    setRequests([]);
    setHistory([]);
    setLocation(null);
  };

  const refresh = () => loadAll(token, user.role);

  // Слайдер лимита: меняем локально мгновенно (для отклика), а реальный запрос
  // к серверу шлём с задержкой в 500мс после последнего движения — иначе
  // при перетаскивании улетело бы по запросу на каждый пиксель.
  const changeLimitMinutes = (value) => {
    setOverview((prev) => (prev ? { ...prev, limitMinutes: value } : prev));
    if (limitDebounceRef.current) clearTimeout(limitDebounceRef.current);
    limitDebounceRef.current = setTimeout(() => {
      apiFetch("/api/settings/limit", { method: "PUT", token, body: { limitMinutes: value } }).catch((err) =>
        setLoadError(err.message)
      );
    }, 500);
  };

  const toggleScheduleBlock = async (blockId, active) => {
    setSchedule((prev) => prev.map((b) => (b.id === blockId ? { ...b, active } : b)));
    try {
      await apiFetch(`/api/settings/schedule/${blockId}`, { method: "PUT", token, body: { active } });
    } catch (err) {
      setLoadError(err.message);
      setSchedule((prev) => prev.map((b) => (b.id === blockId ? { ...b, active: !active } : b))); // откат при ошибке
    }
  };

    const createScheduleBlock = async ({ label, blockType, startTime, endTime }) => {
    await apiFetch("/api/settings/schedule", { method: "POST", token, body: { label, blockType, startTime, endTime } });
    await refresh();
  };
  const markAlertDiscussed = async (id) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, discussed: true } : a)));
    try {
      await apiFetch(`/api/alerts/${id}/discuss`, { method: "POST", token });
    } catch (err) {
      setLoadError(err.message);
    }
  };

  // Одобрение/отклонение меняет сразу несколько сущностей на сервере (запрос,
  // бонусные минуты, статус квеста) — проще и надёжнее перезапросить всё, чем
  // пытаться повторить эту логику на клиенте.
  const respondToRequest = async (id, decision, comment) => {
    try {
      await apiFetch(`/api/requests/${id}/respond`, { method: "POST", token, body: { decision, comment } });
      await refresh();
    } catch (err) {
      setLoadError(err.message);
    }
  };

  const submitQuest = async (questId) => {
    try {
      await apiFetch(`/api/quests/${questId}/submit`, { method: "POST", token });
      await refresh();
    } catch (err) {
      setLoadError(err.message);
    }
  };

  const submitRequest = async ({ type, amount, label, reason }) => {
    await apiFetch("/api/requests", { method: "POST", token, body: { type, amount, label, reason } });
    await refresh();
  };
const createQuest = async ({ title, description, rewardMinutes }) => {
    await apiFetch("/api/quests", { method: "POST", token, body: { title, description, rewardMinutes } });
    await refresh();
  };
  const pageStyle = { backgroundColor: palette.bg, fontFamily: "'Nunito', ui-sans-serif, system-ui, sans-serif" };
  const fontImport = `@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=Unbounded:wght@600;700;800;900&display=swap');`;

  if (!token || !user) {
    return authMode === "register" ? (
      <RegisterScreen onRegister={handleRegister} onGoToLogin={() => setAuthMode("login")} />
    ) : (
      <LoginScreen onLogin={handleLogin} onGoToRegister={() => setAuthMode("register")} />
    );
  }

  if (loading || !overview) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={pageStyle}>
        <style>{fontImport}</style>
        <div className="text-center">
          <TrustMark size={48} />
          <p className="mt-4 text-sm font-bold" style={{ color: palette.inkSoft }}>
            {wakingUp ? "Бэкенд просыпается — это может занять до минуты…" : "Загружаем данные…"}
          </p>
          {loadError && (
            <p className="mt-3 text-sm font-semibold" style={{ color: palette.roseText }}>
              {loadError}
            </p>
          )}
        </div>
      </div>
    );
  }

  const actions = {
    setLimitMinutes: changeLimitMinutes,
    toggleScheduleBlock,
    createScheduleBlock,
    respondToRequest,
    submitQuest,
    submitRequest,
    createQuest,
    markAlertDiscussed,
    addChild: handleAddChild,
  };

  const role = user.role;

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ ...pageStyle }}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden -z-10" aria-hidden="true">
        <div
          style={{
            position: "absolute",
            top: -90,
            right: -90,
            width: 340,
            height: 340,
            borderRadius: "9999px",
            backgroundColor: role === "parent" ? palette.tealSoft : palette.coralSoft,
            filter: "blur(75px)",
            opacity: 0.55,
            transition: "background-color 0.6s ease",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 300,
            left: -110,
            width: 280,
            height: 280,
            borderRadius: "9999px",
            backgroundColor: role === "parent" ? palette.skySoft : palette.lavenderSoft,
            filter: "blur(75px)",
            opacity: 0.5,
            transition: "background-color 0.6s ease",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -110,
            right: 140,
            width: 260,
            height: 260,
            borderRadius: "9999px",
            backgroundColor: role === "parent" ? palette.lavenderSoft : palette.tealSoft,
            filter: "blur(75px)",
            opacity: 0.45,
            transition: "background-color 0.6s ease",
          }}
        />
      </div>

      <style>{`
        ${fontImport}

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }

        button { cursor: pointer; transition: filter 0.15s ease, transform 0.15s ease; }
        button:hover:not(:disabled) { filter: brightness(0.96); }
        button:disabled { cursor: not-allowed; }
        button:focus-visible { outline: 2px solid ${palette.teal}; outline-offset: 2px; border-radius: 10px; }

        .field-focus { outline: none; }
        .field-focus:focus { box-shadow: 0 0 0 3px ${palette.tealSoft}; border-color: ${palette.teal}; }

        .range-slider { -webkit-appearance: none; appearance: none; height: 8px; border-radius: 9999px; outline: none; }
        .range-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 9999px; background: #fff; border: 4px solid ${palette.teal}; box-shadow: 0 1px 4px rgba(0,0,0,0.25); cursor: pointer; }
        .range-slider::-moz-range-thumb { width: 22px; height: 22px; border-radius: 9999px; background: #fff; border: 4px solid ${palette.teal}; box-shadow: 0 1px 4px rgba(0,0,0,0.25); cursor: pointer; border: none; }
        .range-slider::-moz-range-track { height: 8px; border-radius: 9999px; background: transparent; }
        .range-slider:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 4px ${palette.tealSoft}, 0 1px 4px rgba(0,0,0,0.25); }
      `}</style>

      <Header user={user} onLogout={handleLogout} />
      <main className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {loadError && (
          <div
            className="mb-6 rounded-2xl p-3 flex items-center gap-2 text-sm font-semibold"
            style={{ backgroundColor: palette.roseSoft, color: palette.roseText }}
          >
            <AlertTriangle size={16} className="shrink-0" />
            {loadError}
          </div>
        )}
        {role === "parent" ? <ParentDashboard state={state} actions={actions} /> : <ChildDashboard state={state} actions={actions} />}
      </main>
    </div>
  );
}
