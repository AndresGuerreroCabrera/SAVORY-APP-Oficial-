import { Platform } from "react-native";

import { supabase } from "./supabase";

type AnalyticsMetadata = Record<string, unknown>;

type TrackAppEventInput = {
  durationMs?: number;
  entityId?: string | null;
  entityType?: string | null;
  eventName: string;
  metadata?: AnalyticsMetadata;
  route?: string | null;
};

type AppEventPayload = {
  duration_ms: number | null;
  entity_id: string | null;
  entity_type: string | null;
  event_name: string;
  metadata: AnalyticsMetadata;
  platform: string;
  referrer: string | null;
  route: string | null;
  session_id: string;
  user_agent: string | null;
  user_id: string | null;
  viewport_height: number | null;
  viewport_width: number | null;
};

const SESSION_STORAGE_KEY = "savory.analytics.session_id";
const FORBIDDEN_METADATA_KEY_PARTS = ["password", "pass", "token", "secret", "key", "authorization", "email"];
const MAX_METADATA_KEYS = 24;
const MAX_STRING_LENGTH = 240;
const MAX_QUEUE_SIZE = 20;
const FLUSH_DELAY_MS = 900;
const USER_CACHE_TTL_MS = 30_000;

let cachedSessionId: string | null = null;
let cachedUserId: string | null = null;
let cachedUserIdAt = 0;
let eventQueue: AppEventPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

export async function trackAppEvent(input: TrackAppEventInput) {
  if (!supabase || !input.eventName.trim()) {
    return;
  }

  try {
    const sessionId = getAnalyticsSessionId();
    const userId = await getCurrentAnalyticsUserId();
    const browserInfo = getBrowserInfo();

    enqueueEvent({
      duration_ms: typeof input.durationMs === "number" ? Math.max(0, Math.round(input.durationMs)) : null,
      entity_id: input.entityId ?? null,
      entity_type: input.entityType ?? null,
      event_name: input.eventName.trim().slice(0, 80),
      metadata: sanitizeMetadata(input.metadata ?? {}),
      platform: Platform.OS,
      referrer: browserInfo.referrer,
      route: input.route ?? getCurrentRoute(),
      session_id: sessionId,
      user_agent: browserInfo.userAgent,
      user_id: userId,
      viewport_height: browserInfo.viewportHeight,
      viewport_width: browserInfo.viewportWidth,
    });
  } catch {
    // Analytics must never break the product flow.
  }
}

export async function flushAppAnalytics() {
  await flushQueuedEvents();
}

export function getAnalyticsSessionId() {
  if (cachedSessionId) {
    return cachedSessionId;
  }

  const stored = getStoredSessionId();

  if (stored) {
    cachedSessionId = stored;
    return stored;
  }

  cachedSessionId = createSessionId();
  storeSessionId(cachedSessionId);
  return cachedSessionId;
}

function getStoredSessionId() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeSessionId(sessionId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  } catch {
    // Ignore storage restrictions.
  }
}

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getCurrentRoute() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.location.pathname || null;
}

function getBrowserInfo() {
  if (typeof window === "undefined") {
    return {
      referrer: null,
      userAgent: null,
      viewportHeight: null,
      viewportWidth: null,
    };
  }

  return {
    referrer: document.referrer || null,
    userAgent: navigator.userAgent || null,
    viewportHeight: Number.isFinite(window.innerHeight) ? window.innerHeight : null,
    viewportWidth: Number.isFinite(window.innerWidth) ? window.innerWidth : null,
  };
}

async function getCurrentAnalyticsUserId() {
  const now = Date.now();

  if (now - cachedUserIdAt < USER_CACHE_TTL_MS) {
    return cachedUserId;
  }

  try {
    const { data: sessionData } = await supabase!.auth.getSession();

    cachedUserId = sessionData.session?.user.id ?? null;
    cachedUserIdAt = now;
    return cachedUserId;
  } catch {
    cachedUserId = null;
    cachedUserIdAt = now;
    return null;
  }
}

function enqueueEvent(payload: AppEventPayload) {
  eventQueue = [...eventQueue, payload].slice(-MAX_QUEUE_SIZE);

  if (eventQueue.length >= MAX_QUEUE_SIZE) {
    void flushQueuedEvents();
    return;
  }

  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer || typeof setTimeout === "undefined") {
    return;
  }

  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueuedEvents();
  }, FLUSH_DELAY_MS);
}

async function flushQueuedEvents() {
  if (!supabase || flushing || eventQueue.length === 0) {
    return;
  }

  flushing = true;
  const batch = eventQueue;
  eventQueue = [];

  try {
    await supabase.from("app_events").insert(batch);
  } catch {
    // Drop analytics failures; product flows must keep working.
  } finally {
    flushing = false;
  }
}

function sanitizeMetadata(metadata: AnalyticsMetadata) {
  const cleanEntries = Object.entries(metadata)
    .filter(([key]) => !isForbiddenMetadataKey(key))
    .slice(0, MAX_METADATA_KEYS)
    .map(([key, value]) => [key.slice(0, 80), sanitizeMetadataValue(value)] as const)
    .filter(([, value]) => value !== undefined);

  return Object.fromEntries(cleanEntries);
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    return value.slice(0, MAX_STRING_LENGTH);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 12).map(sanitizeMetadataValue).filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    return sanitizeMetadata(value as AnalyticsMetadata);
  }

  return undefined;
}

function isForbiddenMetadataKey(key: string) {
  const normalizedKey = key.toLowerCase();
  return FORBIDDEN_METADATA_KEY_PARTS.some((part) => normalizedKey.includes(part));
}
