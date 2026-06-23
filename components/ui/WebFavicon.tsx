import { useEffect } from "react";
import { Platform } from "react-native";

const FAVICON_VERSION = "20260623-pin";
const FAVICON_HREF = `/favicon.ico?v=${FAVICON_VERSION}`;

export function WebFavicon() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      return;
    }

    const upsertIconLink = (rel: string) => {
      let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);

      if (!link) {
        link = document.createElement("link");
        link.rel = rel;
        document.head.appendChild(link);
      }

      link.href = FAVICON_HREF;
      link.type = "image/x-icon";
    };

    upsertIconLink("icon");
    upsertIconLink("shortcut icon");
  }, []);

  return null;
}
