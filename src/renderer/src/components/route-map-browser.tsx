import { LoaderCircle, MapPinned, Navigation, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import L, { type LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Location } from "@shared/types/load";
import { Button } from "@/components/ui/button";

interface RouteMapBrowserProps {
  origin: Location;
  destination: Location;
  onClose: () => void;
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

type RouteKind = "loading" | "driving" | "direct";

/** A renderer-native map; external map sites frequently reject Electron BrowserViews. */
export function RouteMapBrowser({ origin, destination, onClose }: RouteMapBrowserProps): JSX.Element {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const originCoordinates = useLocationCoordinates(origin);
  const destinationCoordinates = useLocationCoordinates(destination);
  const [routeKind, setRouteKind] = useState<RouteKind>("loading");
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const originKey = coordinateKey(originCoordinates);
  const destinationKey = coordinateKey(destinationCoordinates);
  const originLabel = formatLocation(origin);
  const destinationLabel = formatLocation(destination);
  const locationsReady = Boolean(originCoordinates && destinationCoordinates);

  useEffect(() => {
    const element = mapElementRef.current;
    if (!element || !originCoordinates || !destinationCoordinates) return;

    let active = true;
    const start: LatLngTuple = [originCoordinates.latitude, originCoordinates.longitude];
    const end: LatLngTuple = [destinationCoordinates.latitude, destinationCoordinates.longitude];
    const map = L.map(element, { zoomControl: true, attributionControl: true, preferCanvas: true });
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors"
    }).addTo(map);
    const route = L.polyline([start, end], {
      color: "#0284c7",
      weight: 5,
      opacity: 0.82,
      lineCap: "round",
      lineJoin: "round"
    }).addTo(map);

    L.marker(start, { icon: markerIcon("Pickup", "#0284c7") }).addTo(map).bindTooltip(originLabel, { direction: "top" });
    L.marker(end, { icon: markerIcon("Delivery", "#059669") }).addTo(map).bindTooltip(destinationLabel, { direction: "top" });
    map.fitBounds(L.latLngBounds([start, end]), { padding: [56, 56], maxZoom: 10 });
    requestAnimationFrame(() => map.invalidateSize());

    tiles.once("load", () => {
      if (active) setTilesLoaded(true);
    });

    const controller = new AbortController();
    setRouteKind("loading");
    void requestDrivingRoute(start, end, controller.signal)
      .then((points) => {
        if (!active) return;
        route.setLatLngs(points);
        map.fitBounds(route.getBounds(), { padding: [56, 56], maxZoom: 10 });
        setRouteKind("driving");
      })
      .catch(() => {
        if (active) setRouteKind("direct");
      });

    return () => {
      active = false;
      controller.abort();
      map.remove();
    };
  }, [destinationCoordinates, destinationKey, destinationLabel, originCoordinates, originKey, originLabel]);

  const status = useMemo(() => {
    if (!locationsReady) return "Finding map coordinates…";
    if (!tilesLoaded) return "Loading map…";
    if (routeKind === "loading") return "Calculating road route…";
    return routeKind === "driving" ? "Driving route" : "Direct route preview";
  }, [locationsReady, routeKind, tilesLoaded]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-950/55 p-5 backdrop-blur-sm">
      <section className="mx-auto flex h-full w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl">
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-slate-200 px-4 py-2">
          <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-sm text-slate-600">
            {routeKind === "loading" || !locationsReady ? (
              <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-sky-600" />
            ) : (
              <MapPinned className="h-4 w-4 shrink-0 text-sky-600" />
            )}
            <span className="truncate font-semibold text-slate-800">Route map</span>
            <span className="hidden rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 sm:inline">{status}</span>
          </div>
          <Button aria-label="Close route map" onClick={onClose} size="sm" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="relative min-h-[320px] flex-1 bg-slate-100">
          {locationsReady ? <div ref={mapElementRef} className="h-full w-full" /> : <LocationPending origin={origin} destination={destination} />}
          {locationsReady && routeKind === "direct" ? (
            <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full border border-amber-200 bg-amber-50/95 px-4 py-2 text-xs font-medium text-amber-900 shadow-sm">
              Road routing is unavailable. Showing the direct route line.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function LocationPending({ origin, destination }: { origin: Location; destination: Location }): JSX.Element {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="max-w-md rounded-2xl border border-sky-100 bg-white p-6 text-center shadow-lg shadow-sky-950/10">
        <Navigation className="mx-auto h-6 w-6 text-sky-600" />
        <p className="mt-3 font-semibold text-slate-800">Map coordinates are not available yet</p>
        <p className="mt-2 text-sm text-slate-500">Add a ZIP code or coordinates for both locations to display the route.</p>
        <p className="mt-4 text-xs text-slate-400">{formatLocation(origin)} → {formatLocation(destination)}</p>
      </div>
    </div>
  );
}

function useLocationCoordinates(location: Location): Coordinates | undefined {
  const directCoordinates = useMemo(() => {
    if (location.latitude === undefined || location.longitude === undefined) return undefined;
    return { latitude: location.latitude, longitude: location.longitude };
  }, [location.latitude, location.longitude]);
  const key = `${location.postalCode ?? ""}|${location.latitude ?? ""}|${location.longitude ?? ""}`;
  const [coordinates, setCoordinates] = useState<Coordinates | undefined>(directCoordinates);

  useEffect(() => {
    let active = true;
    if (directCoordinates) {
      setCoordinates(directCoordinates);
      return () => {
        active = false;
      };
    }
    setCoordinates(undefined);
    if (!location.postalCode) return () => {
      active = false;
    };
    void import("zipcodes").then(({ lookup }) => {
      const zipCode = lookup(location.postalCode!);
      if (active && zipCode) setCoordinates({ latitude: zipCode.latitude, longitude: zipCode.longitude });
    });
    return () => {
      active = false;
    };
  }, [directCoordinates, key, location.postalCode]);

  return coordinates;
}

function coordinateKey(coordinates: Coordinates | undefined): string {
  return coordinates ? `${coordinates.latitude},${coordinates.longitude}` : "pending";
}

async function requestDrivingRoute(start: LatLngTuple, end: LatLngTuple, signal: AbortSignal): Promise<LatLngTuple[]> {
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Route request failed");
  const data = (await response.json()) as { code?: string; routes?: Array<{ geometry?: { coordinates?: [number, number][] } }> };
  const points = data.routes?.[0]?.geometry?.coordinates;
  if (data.code !== "Ok" || !points?.length) throw new Error("No route found");
  return points.map(([longitude, latitude]) => [latitude, longitude]);
}

function markerIcon(label: string, color: string): L.DivIcon {
  return L.divIcon({
    className: "car-hauler-route-marker",
    html: `<span style="display:block;width:max-content;border:2px solid white;border-radius:999px;background:${color};padding:4px 8px;color:white;font:600 11px system-ui;box-shadow:0 2px 6px #0f172a55">${label}</span>`,
    iconSize: [72, 26],
    iconAnchor: [36, 26]
  });
}

function formatLocation(location: Location): string {
  return [location.city, location.state, location.postalCode].filter(Boolean).join(", ") || "Location pending";
}
