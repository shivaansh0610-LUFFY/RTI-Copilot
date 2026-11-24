import {
  AlertTriangle,
  Camera,
  ExternalLink,
  ImagePlus,
  Loader2,
  MapPin,
  X,
} from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import {
  formatCoordinates,
  googleMapsUrl,
  isClearlyOutsideDelhi,
  type IssueLocation,
} from "./location";
import type { LocationPicker } from "./use-location-picker";
import { useObjectUrl } from "./use-object-url";

const CHIP =
  "flex min-h-9 items-center gap-1.5 rounded-full border border-edge-strong bg-white px-3 text-[13px] font-medium text-ink-3 hover:border-ink-3";

// A GPS fix this loose could be the wrong street; ask the citizen to check the pin.
const LOOSE_FIX_METERS = 100;

// A fix this loose isn't GPS or Wi-Fi at all -- it's the browser falling back to guessing from
// the internet connection, which can be a different city entirely. Worth a stronger warning than
// "approximate".
const NETWORK_FIX_METERS = 10_000;

// People filing by hand are used to attaching several photos of the same problem (different
// angles, a close-up and a wider shot); one was an arbitrary limit this lifts.
export const MAX_PHOTOS = 5;

export function PhotoLocation({
  photos,
  onPhotosChange,
  location,
  picker,
}: {
  photos: File[];
  onPhotosChange: (photos: File[]) => void;
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
    if (photos.length >= MAX_PHOTOS) {
      setPhotoError(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }
    setPhotoError("");
    onPhotosChange([...photos, file]);
    // Taking the photo is the moment the citizen is at the spot. Don't override a fix they
    // already have, or start a second GPS request on top of one already running.
    if (!location && !picker.isLocating) picker.locateDevice();
  }

  function removePhoto(index: number) {
    onPhotosChange(photos.filter((_, i) => i !== index));
  }

  return (
    <section
      aria-label="Photo and location"
      className="mt-2 flex flex-col gap-3 rounded-lg border border-edge bg-card p-4"
    >
      <p className="text-sm font-semibold text-ink">
        Add a photo <span className="font-normal text-muted">(optional, up to {MAX_PHOTOS})</span>
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

      {photoError && <p className="text-[13px] text-[#8a4b08]">{photoError}</p>}
      {photos.length > 0 && (
        <div className="flex flex-col gap-2">
          {photos.map((photo, index) => (
            <PhotoPreview key={`${photo.name}-${index}`} photo={photo} onRemove={() => removePhoto(index)} />
          ))}
        </div>
      )}

      <div aria-live="polite" className="flex flex-col gap-1.5">
        {picker.isLocating && (
          <p className="flex items-center gap-1.5 text-[13px] text-ink-3">
            <Loader2 size={13} className="animate-spin" />
            Finding your location. If your browser asks, choose Allow.
          </p>
        )}

        {location && (
          <div className="flex flex-col gap-1 text-[13px] text-ink-2">
            <p className="flex items-start gap-1.5">
              <MapPin size={14} className="mt-0.5 shrink-0 text-stamp" />
              <span>
                {location.address ??
                  (picker.isLookingUp ? "Looking up the street name…" : formatCoordinates(location))}
                {location.accuracyMeters !== undefined && (
                  <span className="text-muted">
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
                className="inline-flex items-center gap-1 font-medium text-ink-blue underline underline-offset-2"
              >
                Check in Google Maps
                <ExternalLink size={12} />
              </a>
              <button
                type="button"
                onClick={picker.clear}
                className="inline-flex items-center gap-1 text-ink-3 underline"
              >
                <X size={12} />
                Clear location
              </button>
            </p>
          </div>
        )}

        {location?.accuracyMeters !== undefined && location.accuracyMeters > NETWORK_FIX_METERS && (
          <p className="flex items-start gap-1.5 text-[13px] text-[#8a4b08]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            This doesn&apos;t look like your real spot -- your browser guessed it from your internet
            connection, not GPS. Please mention the exact location in your description instead.
          </p>
        )}
        {location?.accuracyMeters !== undefined &&
          location.accuracyMeters > LOOSE_FIX_METERS &&
          location.accuracyMeters <= NETWORK_FIX_METERS && (
            <p className="text-[13px] text-[#8a4b08]">
              This position is only approximate -- mention the exact spot in your description if it matters.
            </p>
          )}
        {location &&
          isClearlyOutsideDelhi(location) &&
          (location.accuracyMeters ?? 0) <= NETWORK_FIX_METERS && (
            <p className="flex items-start gap-1.5 text-[13px] text-[#8a4b08]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              This spot looks to be outside Delhi, so a Delhi department may not be responsible for it.
            </p>
          )}
        {picker.message && <p className="text-[13px] text-[#8a4b08]">{picker.message}</p>}
      </div>
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
          className="h-20 w-20 shrink-0 rounded-md border border-edge object-cover"
        />
      )}
      <div className="flex flex-col items-start gap-1">
        <p className="text-[13px] text-ink-2">
          Photo added. It stays on this device and isn&apos;t sent anywhere -- it's listed as an
          enclosure on the draft, and the Draft step lets you print or save it alongside the
          application, but you attach it yourself when you file.
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1 text-[13px] text-ink-3 underline"
        >
          <X size={12} />
          Remove photo
        </button>
      </div>
    </div>
  );
}
