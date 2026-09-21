import { Bookmark, BookmarkCheck, ExternalLink, LoaderCircle, MapPinned, Route, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Load, LoadCarrierAccess, LoadCompany, LoadPaymentDetails, Stop, Vehicle } from "@shared/types/load";
import { SourceBadges, sourceLabel } from "@/components/ui/source-badge";

interface LoadInspectorProps {
  load?: Load;
  onClose?: () => void;
  onRoute?: (load: Load) => void;
  onSave?: (load: Load) => void;
  onRemove?: (load: Load) => void;
  isSaved?: boolean;
  isSaving?: boolean;
}

export function LoadInspector({ load, onClose, onRoute, onSave, onRemove, isSaved = false, isSaving = false }: LoadInspectorProps): JSX.Element {
  if (!load) {
    return <aside className="hidden h-full min-h-0 rounded-xl border border-white/10 bg-[#101318] p-5 xl:block"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Inspector</p><div className="grid h-[calc(100%-28px)] min-h-0 place-items-center text-center"><div><Route className="mx-auto h-6 w-6 text-slate-600" /><p className="mt-3 text-sm font-medium text-slate-300">Choose a load</p><p className="mt-1 text-xs leading-5 text-slate-500">The complete normalized provider record will appear here.</p></div></div></aside>;
  }

  const details = load.details;
  const company = details?.company;
  const payment = details?.payment;

  return <aside className="h-full min-h-0 overflow-y-auto rounded-xl border border-white/10 bg-[#101318] p-5 shadow-2xl shadow-black/20">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Load inspector</p><div className="mt-2"><SourceBadges source={load.source} duplicates={load.duplicateSources} /></div></div>{onClose ? <button onClick={onClose} type="button" aria-label="Close inspector" className="rounded-md p-1 text-slate-500 transition hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button> : null}</div>

    <section className="mt-5 rounded-lg border border-white/[0.08] bg-white/[0.025] p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Load identity</p><DataList className="mt-2" values={[["Source", sourceLabel(load.source)], ["Load ID", details?.shipperOrderId ?? load.externalId], ["Source listing", details?.shipperOrderId && details.shipperOrderId !== load.externalId ? load.externalId : undefined], ["Status", load.status], ["Trailer", humanize(load.trailerType)], ["Posted", formatDateTime(load.postedAt)], ["Updated", formatDateTime(load.updatedAt)]]} /></section>

    <section className="mt-5 border-y border-white/10 py-5"><StopDetail title="Pickup" direction="up" stop={load.pickup} /><div className="ml-4 h-5 border-l border-dashed border-slate-600" /><StopDetail title="Delivery" direction="down" stop={load.delivery} /></section>

    <dl className="grid grid-cols-2 gap-x-4 gap-y-5 py-5"><Metric label="Carrier pay" value={load.price ? formatMoney(load.price.amountCents) : "Not listed"} accent /><Metric label="Rate per mile" value={load.ratePerMileCents === undefined ? "Not listed" : `$${(load.ratePerMileCents / 100).toFixed(2)}/mi`} /><Metric label="Distance" value={load.distanceMiles === undefined ? "Not listed" : `${load.distanceMiles.toLocaleString()} mi`} /><Metric label="Vehicles" value={`${load.vehicles.length} ${load.vehicles.length === 1 ? "vehicle" : "vehicles"}`} /></dl>

    <Section title="Vehicles"><div className="mt-3 space-y-3">{load.vehicles.map((vehicle, index) => <VehicleDetail key={`${vehicle.vin ?? "vehicle"}-${index}`} vehicle={vehicle} index={index} />)}</div></Section>

    <Section title="Broker / source"><p className="mt-3 text-sm font-semibold text-slate-200">{company?.name ?? sourceLabel(load.source)}</p><DataList className="mt-3" values={companyValues(company)} /></Section>

    {paymentValues(payment).length ? <Section title="Payment"><DataList className="mt-3" values={paymentValues(payment)} /></Section> : null}
    {detailValues(details).length ? <Section title="Load details"><DataList className="mt-3" values={detailValues(details)} /></Section> : null}

    <div className="mt-6 grid gap-2">
      {onSave || onRemove ? <button type="button" disabled={isSaving} onClick={() => isSaved ? onRemove?.(load) : onSave?.(load)} className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${isSaved ? "border border-emerald-400/25 bg-emerald-400/10 text-emerald-200 hover:bg-rose-400/10 hover:text-rose-200" : "border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white"}`}>{isSaving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : isSaved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}{isSaving ? "Updating My Loads…" : isSaved ? "Saved to My Loads · Remove" : "Save to My Loads"}</button> : null}
      <button type="button" disabled={!onRoute} onClick={() => onRoute?.(load)} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"><MapPinned className="h-3.5 w-3.5" />View route</button>
      {load.sourceUrl ? <a href={load.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white"><ExternalLink className="h-3.5 w-3.5" />Open {sourceLabel(load.source)}</a> : null}
    </div>
  </aside>;
}

function StopDetail({ title, direction, stop }: { title: string; direction: "up" | "down"; stop: Stop }): JSX.Element {
  return <div className="flex gap-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${direction === "up" ? "bg-emerald-400/10 text-emerald-300" : "bg-sky-400/10 text-sky-300"}`}>{direction === "up" ? "↑" : "↓"}</span><div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p><p className="mt-1 text-sm font-semibold text-white">{formatLocation(stop.location)}</p><DataList className="mt-2" values={[["Window", dateRange(stop.availableFrom, stop.availableTo)], ["Venue", humanize(stop.locationType)]]} /></div></div>;
}

function VehicleDetail({ vehicle, index }: { vehicle: Vehicle; index: number }): JSX.Element {
  const title = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || `Vehicle ${index + 1}`;
  const dimensions = vehicle.dimensions && [vehicle.dimensions.lengthInches, vehicle.dimensions.widthInches, vehicle.dimensions.heightInches].some((value) => value !== undefined) ? `${vehicle.dimensions.lengthInches ?? "—"} × ${vehicle.dimensions.widthInches ?? "—"} × ${vehicle.dimensions.heightInches ?? "—"} in` : undefined;
  return <article className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold text-slate-200">{title}</p>{vehicle.operable !== undefined ? <span className={vehicle.operable ? "text-[11px] font-semibold text-emerald-300" : "text-[11px] font-semibold text-amber-300"}>{vehicle.operable ? "Operable" : "Inoperable"}</span> : null}</div><DataList className="mt-3" values={[["VIN", vehicle.vin], ["Type", humanize(vehicle.vehicleType)], ["Quantity", vehicle.quantity?.toString()], ["Color", vehicle.color], ["Lot", vehicle.lotNumber], ["Weight", vehicle.weightPounds === undefined ? undefined : `${vehicle.weightPounds.toLocaleString()} lb`], ["Dimensions", dimensions], ["Issues", vehicle.issues?.join(", ")], ["Notes", vehicle.additionalInfo]]} /></article>;
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element { return <section className="mt-5 border-t border-white/10 pt-5"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p>{children}</section>; }
function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }): JSX.Element { return <div><dt className="text-[11px] text-slate-500">{label}</dt><dd className={`mt-1 text-sm font-semibold ${accent ? "text-emerald-300" : "text-slate-200"}`}>{value}</dd></div>; }
function DataList({ values, className = "" }: { values: Array<[string, ReactNode | undefined]>; className?: string }): JSX.Element { const available = values.filter(([, value]) => value !== undefined && value !== null && value !== ""); return available.length ? <dl className={`space-y-1.5 ${className}`}>{available.map(([label, value]) => <div key={label} className="grid grid-cols-[94px_minmax(0,1fr)] gap-2 text-xs"><dt className="text-slate-500">{label}</dt><dd className="break-words text-slate-300">{value}</dd></div>)}</dl> : <p className={`text-xs text-slate-500 ${className}`}>Not provided by the source.</p>; }

function companyValues(company?: LoadCompany): Array<[string, ReactNode | undefined]> { return [["Contact", company?.contactName], ["Phone", company?.phone], ["Email", company?.email], ["Hours", company?.hours], ["Time zone", company?.timeZone], ["Tier", company?.tier], ["Rating", rating(company?.rating, company?.ratingCount)], ["Overall rating", rating(company?.overallRating, company?.overallRatingCount)], ["Preferred", booleanLabel(company?.preferred)], ["Verified", company?.verificationStatus], ["Vehicles moved", company?.movedVehiclesCount?.toLocaleString()]]; }
function paymentValues(payment?: LoadPaymentDetails): Array<[string, ReactNode | undefined]> { return [["COD", payment?.codAmountCents === undefined ? undefined : formatMoney(payment.codAmountCents)], ["COD method", payment?.codMethod], ["COD location", payment?.codLocation], ["Balance", payment?.balanceAmountCents === undefined ? undefined : formatMoney(payment.balanceAmountCents)], ["Balance timing", payment?.balancePaymentTime], ["Balance method", payment?.balancePaymentMethod], ["Processing", payment?.processingMethod], ["Method", payment?.method], ["Terms", payment?.terms]]; }
function detailValues(details: Load["details"]): Array<[string, ReactNode | undefined]> { return [["Expires", formatDateTime(details?.expiresAt)], ["Desired delivery", formatDateTime(details?.desiredDeliveryDate)], ["Pickup date type", humanize(details?.pickupDateType)], ["Delivery date type", humanize(details?.deliveryDateType)], ["Pickup hours", humanize(details?.pickupBusinessHoursType)], ["Delivery hours", humanize(details?.deliveryBusinessHoursType)], ["Inspection", booleanLabel(details?.requiresInspection)], ["TWIC", booleanLabel(details?.twicRequired)], ["Can book", accessLabel(details?.carrierAccess, "canBook")], ["Can request", accessLabel(details?.carrierAccess, "canRequest")], ["Certificate", accessLabel(details?.carrierAccess, "certificateRequired")], ["ACH required", accessLabel(details?.carrierAccess, "achPaymentRequired")], ["Notes", details?.additionalInfo], ["Pre-dispatch", details?.preDispatchNotes]]; }
function accessLabel(access: LoadCarrierAccess | undefined, key: keyof LoadCarrierAccess): string | undefined { return booleanLabel(access?.[key]); }
function booleanLabel(value?: boolean): string | undefined { return value === undefined ? undefined : value ? "Yes" : "No"; }
function rating(value?: number, count?: number): string | undefined { return value === undefined ? undefined : `${value.toFixed(1)}${count === undefined ? "" : ` (${count.toLocaleString()})`}`; }
function formatLocation(location: Load["pickup"]["location"]): string { return [location.city, location.state, location.postalCode].filter(Boolean).join(", ") || "Location pending"; }
function dateRange(from?: string, to?: string): string | undefined { const start = formatDateTime(from); const end = formatDateTime(to); return start && end ? `${start} – ${end}` : start ?? end; }
function formatDateTime(value?: string): string | undefined { if (!value) return undefined; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); }
function formatMoney(cents: number): string { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100); }
function humanize(value?: string): string | undefined { return value ? value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : undefined; }
