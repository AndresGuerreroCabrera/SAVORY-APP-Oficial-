import { usePathname } from "expo-router";
import { useEffect, useRef } from "react";

import { trackAppEvent } from "../../services/appAnalytics";

export function ProductAnalyticsTracker() {
  const pathname = usePathname();
  const activeRouteRef = useRef(pathname);
  const routeStartedAtRef = useRef(Date.now());

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

    void trackAppEvent({
      eventName: "screen_view",
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

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      flushDuration("screen_unmount");
    };
  }, []);

  return null;
}
