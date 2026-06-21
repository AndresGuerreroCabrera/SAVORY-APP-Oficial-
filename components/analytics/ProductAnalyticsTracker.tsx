import { usePathname } from "expo-router";
import { useEffect, useRef } from "react";

import { flushAppAnalytics, trackAppEvent } from "../../services/appAnalytics";

const SCROLL_DEPTH_MARKS = [25, 50, 75, 90];
const HEARTBEAT_INTERVAL_MS = 60_000;

export function ProductAnalyticsTracker() {
  const pathname = usePathname();
  const activeRouteRef = useRef(pathname);
  const routeStartedAtRef = useRef(Date.now());
  const scrollDepthMarksRef = useRef(new Set<number>());

  useEffect(() => {
    const previousRoute = activeRouteRef.current;
    const previousStartedAt = routeStartedAtRef.current;
    const now = Date.now();

    if (previousRoute && previousRoute !== pathname) {
      void trackAppEvent({
        durationMs: now - previousStartedAt,
        eventName: "screen_duration",
        route: previousRoute,
      });
    }

    activeRouteRef.current = pathname;
    routeStartedAtRef.current = now;
    scrollDepthMarksRef.current = new Set();

    void trackAppEvent({
      eventName: "screen_view",
      metadata: getPageContext(),
      route: pathname,
    });
  }, [pathname]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const flushDuration = (eventName: string) => {
      const route = activeRouteRef.current;

      if (!route) {
        return;
      }

      const now = Date.now();
      void trackAppEvent({
        durationMs: now - routeStartedAtRef.current,
        eventName,
        route,
      });
      routeStartedAtRef.current = now;
      void flushAppAnalytics();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushDuration("screen_hidden");
      } else {
        routeStartedAtRef.current = Date.now();
        void trackAppEvent({
          eventName: "screen_visible",
          route: activeRouteRef.current,
        });
      }
    };

    const handleBeforeUnload = () => {
      flushDuration("screen_unload");
    };

    const handlePointerDown = (event: PointerEvent) => {
      const element = getInteractiveElement(event.target);

      if (!element) {
        return;
      }

      void trackAppEvent({
        eventName: "ui_interaction",
        metadata: getInteractionMetadata(element),
        route: activeRouteRef.current,
      });
    };

    const handleFocusIn = (event: FocusEvent) => {
      const element = getInteractiveElement(event.target);

      if (!element || !isFormField(element)) {
        return;
      }

      void trackAppEvent({
        eventName: "input_focus",
        metadata: {
          field_kind: getFieldKind(element),
          label: getElementLabel(element),
          tag: element.tagName.toLowerCase(),
        },
        route: activeRouteRef.current,
      });
    };

    const handleScroll = () => {
      const depth = getScrollDepth();

      for (const mark of SCROLL_DEPTH_MARKS) {
        if (depth >= mark && !scrollDepthMarksRef.current.has(mark)) {
          scrollDepthMarksRef.current.add(mark);
          void trackAppEvent({
            eventName: "scroll_depth",
            metadata: { depth_percent: mark },
            route: activeRouteRef.current,
          });
        }
      }
    };

    const handleError = (event: ErrorEvent) => {
      void trackAppEvent({
        eventName: "client_error",
        metadata: {
          column: event.colno || null,
          line: event.lineno || null,
          message: event.message,
          source: stripUrl(event.filename),
        },
        route: activeRouteRef.current,
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      void trackAppEvent({
        eventName: "client_unhandled_rejection",
        metadata: {
          message: getErrorMessage(event.reason),
        },
        route: activeRouteRef.current,
      });
    };

    void trackAppEvent({
      eventName: "app_session_start",
      metadata: getPageContext(),
      route: activeRouteRef.current,
    });

    const heartbeat = window.setInterval(() => {
      void trackAppEvent({
        durationMs: Date.now() - routeStartedAtRef.current,
        eventName: "app_session_heartbeat",
        metadata: getPageContext(),
        route: activeRouteRef.current,
      });
    }, HEARTBEAT_INTERVAL_MS);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("pointerdown", handlePointerDown, { capture: true });
    document.addEventListener("focusin", handleFocusIn);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      document.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.clearInterval(heartbeat);
      flushDuration("screen_unmount");
    };
  }, []);

  return null;
}

function getInteractiveElement(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest("button, a, input, textarea, select, [role='button'], [role='link']") as HTMLElement | null;
}

function getInteractionMetadata(element: HTMLElement) {
  return {
    href_kind: getHrefKind(element),
    label: getElementLabel(element),
    role: element.getAttribute("role") ?? element.tagName.toLowerCase(),
    tag: element.tagName.toLowerCase(),
  };
}

function getElementLabel(element: HTMLElement) {
  const label =
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    (isFormField(element) ? element.getAttribute("placeholder") : null) ||
    element.textContent ||
    "";

  return label.replace(/\s+/g, " ").trim().slice(0, 120) || null;
}

function isFormField(element: HTMLElement) {
  const tag = element.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

function getFieldKind(element: HTMLElement) {
  if (element instanceof HTMLInputElement) {
    return element.type || "text";
  }

  return element.tagName.toLowerCase();
}

function getHrefKind(element: HTMLElement) {
  const href = element instanceof HTMLAnchorElement ? element.href : element.getAttribute("href");

  if (!href) {
    return null;
  }

  try {
    const url = new URL(href, window.location.href);
    return url.origin === window.location.origin ? "internal" : "external";
  } catch {
    return "unknown";
  }
}

function getScrollDepth() {
  const documentElement = document.documentElement;
  const scrollTop = window.scrollY || documentElement.scrollTop || document.body.scrollTop || 0;
  const scrollableHeight = Math.max(1, documentElement.scrollHeight - window.innerHeight);

  return Math.round((scrollTop / scrollableHeight) * 100);
}

function getPageContext() {
  const connection = getConnectionInfo();

  return {
    connection_effective_type: connection.effectiveType,
    connection_save_data: connection.saveData,
    language: typeof navigator !== "undefined" ? navigator.language : null,
    online: typeof navigator !== "undefined" ? navigator.onLine : null,
    query_present: typeof window !== "undefined" ? Boolean(window.location.search) : false,
    screen_height: typeof window !== "undefined" ? window.screen.height : null,
    screen_width: typeof window !== "undefined" ? window.screen.width : null,
  };
}

function getConnectionInfo() {
  if (typeof navigator === "undefined") {
    return { effectiveType: null, saveData: null };
  }

  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  }).connection;

  return {
    effectiveType: connection?.effectiveType ?? null,
    saveData: connection?.saveData ?? null,
  };
}

function stripUrl(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.slice(0, 160);
  }
}

function getErrorMessage(value: unknown) {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  return String((value as { message?: unknown })?.message ?? value ?? "Error desconocido");
}
