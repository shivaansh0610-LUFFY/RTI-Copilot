import {
  AlertTriangle,
  Camera,
  ExternalLink,
  ImagePlus,
  Loader2,
  MapPin,
  X,
} from "lucide-react";
import { lazy, Suspense, useRef, useState, type ChangeEvent } from "react";
import {
  formatCoordinates,
  googleMapsUrl,
  isClearlyOutsideDelhi,
  type IssueLocation,
} from "./location";
import type { LocationPicker } from "./use-location-picker";
import { useObjectUrl } from "./use-object-url";

// Leaflet is only fetched once someone opens the map.
const LocationMap = lazy(() => import("./LocationMap"));

const CHIP =
  "flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-400";

// A GPS fix this loose could be the wrong street; ask the citizen to check the pin.
const LOOSE_FIX_METERS = 100;

export function PhotoLocation({
  photo,
  onPhotoChange,
  location,
  picker,
}: {
  photo: File | undefined;
  onPhotoChange: (photo: File | undefined) => void;
  location: IssueLocation | undefined;
  picker: LocationPicker;
}) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState("");

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // so choosing the same photo again still counts as a change
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Please choose a photo (an image file).");
      return;
    }
    setPhotoError("");
    onPhotoChange(file);
    // Taking the photo is the moment the citizen is at the spot. Don't move a pin they already set.
    if (!location && !picker.isLocating) picker.locateDevice();
  }

  return (
    <section
      aria-label="Photo and location"
      className="flex flex-col gap-3 rounded-md border border-slate-200 p-3"
    >
      <p className="text-[13px] font-medium text-slate-900">
        Add a photo and mark the spot <span className="font-normal text-slate-500">(optional)</span>
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => cameraInput.current?.click()} className={CHIP}>
          <Camera size={13} />
          Take a photo
        </button>
        <button type="button" onClick={() => galleryInput.current?.click()} className={CHIP}>
          <ImagePlus size={13} />
          Choose from gallery
        </button>
        {!picker.showMap && (
          <button type="button" onClick={picker.openMap} className={CHIP}>
            <MapPin size={13} />
            Choose on map
          </button>
        )}
      </div>

      {/* capture="environment" opens the back camera on a phone; a computer shows a file picker. */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Photo from camera"
        onChange={handleFile}
        className="hidden"
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        aria-label="Photo from gallery"
        onChange={handleFile}
        className="hidden"
      />

      {photoError && <p className="text-[13px] text-amber-600">{photoError}</p>}
      {photo && <PhotoPreview photo={photo} onRemove={() => onPhotoChange(undefined)} />}

      <div aria-live="polite" className="flex flex-col gap-1.5">
        {picker.isLocating && (
          <p className="flex items-center gap-1.5 text-[13px] text-slate-600">
            <Loader2 size={13} className="animate-spin" />
            Finding your location. If your browser asks, choose Allow.
          </p>
        )}

        {location && (
          <div className="flex flex-col gap-1 text-[13px] text-slate-700">
            <p className="flex items-start gap-1.5">
              <MapPin size={14} className="mt-0.5 shrink-0 text-red-600" />
              <span>
                {location.address ??
                  (picker.isLookingUp ? "Looking up the street name…" : formatCoordinates(location))}
                {location.accuracyMeters !== undefined && (
                  <span className="text-slate-500">
                    {" "}
                    · GPS accuracy about {Math.round(location.accuracyMeters)} m
                  </span>
                )}
              </span>
            </p>
            <p className="flex flex-wrap gap-x-4 gap-y-1">
              <a
                href={googleMapsUrl(location)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-700 underline"
              >
                Check in Google Maps
                <ExternalLink size={12} />
              </a>
              <button
                type="button"
                onClick={picker.clear}
                className="inline-flex items-center gap-1 text-slate-600 underline"
              >
                <X size={12} />
                Remove pin
              </button>
            </p>
          </div>
        )}

        {location?.accuracyMeters !== undefined && location.accuracyMeters > LOOSE_FIX_METERS && (
          <p className="text-[13px] text-amber-600">
            This position is only approximate. Drag the pin to the exact spot.
          </p>
        )}
        {location && isClearlyOutsideDelhi(location) && (
          <p className="flex items-start gap-1.5 text-[13px] text-amber-600">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            This spot looks to be outside Delhi, so a Delhi department may not be responsible for it.
          </p>
        )}
        {picker.message && <p className="text-[13px] text-amber-600">{picker.message}</p>}
      </div>

      {picker.showMap && (
        <>
          <Suspense
            fallback={
              <div className="flex h-64 items-center justify-center rounded-md border border-slate-200 text-[13px] text-slate-500">
                Loading map…
              </div>
            }
          >
            <LocationMap location={location} onPick={picker.place} />
          </Suspense>
          <p className="text-xs text-slate-500">
            Is the pin on the problem? Drag it, or tap the map to move it.
          </p>
        </>
      )}
    </section>
  );
}

function PhotoPreview({ photo, onRemove }: { photo: File; onRemove: () => void }) {
  const url = useObjectUrl(photo);
  return (
    <div className="flex items-center gap-3">
      {url && (
        <img
          src={url}
          alt="The photo you added"
          className="h-20 w-20 shrink-0 rounded-md border border-slate-200 object-cover"
        />
      )}
      <div className="flex flex-col items-start gap-1">
        <p className="text-[13px] text-slate-700">
          Photo added. It stays on this device and isn&apos;t sent anywhere, so attach it yourself
          when you file.
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1 text-[13px] text-slate-600 underline"
        >
          <X size={12} />
          Remove photo
        </button>
      </div>
    </div>
  );
}
