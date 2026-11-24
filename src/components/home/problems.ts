import { Construction, Droplets, Footprints, Hammer, Lightbulb, TriangleAlert, type LucideIcon } from "lucide-react";
import { PHOTOS, type Photo } from "./photos";

// Only problems that PWD Delhi, the authority this app drafts for, is responsible for on its
// roads. Garbage, for instance, is the municipal corporation's job, so it is left out rather
// than sending a citizen to the wrong office.
// A repair that did not last: the complaint the inspection and samples offer is made for.
export const REPAIR_STARTER = "The road was repaired recently but it has already broken again at ";

export type Problem = {
  label: string;
  icon: LucideIcon;
  starter: string;
  // Its polaroid on the home page, with a caption in the citizen's own voice.
  polaroid: { photo: Photo; position: string; caption: string };
};

export const PROBLEMS: Problem[] = [
  {
    label: "Pothole or broken road",
    icon: TriangleAlert,
    starter: "There is a pothole / broken road surface at ",
    polaroid: { photo: PHOTOS.polaroidPothole, position: "50% 50%", caption: "Pothole outside my house" },
  },
  {
    label: "Repair broke again quickly",
    icon: Hammer,
    starter: REPAIR_STARTER,
    polaroid: { photo: PHOTOS.polaroidRepair, position: "45% 50%", caption: "Repaired, broken again" },
  },
  {
    label: "Broken footpath",
    icon: Footprints,
    starter: "The footpath is broken and unsafe to walk on at ",
    polaroid: { photo: PHOTOS.polaroidFootpath, position: "50% 60%", caption: "A footpath you can’t walk on" },
  },
  {
    label: "Waterlogging or blocked drain",
    icon: Droplets,
    starter: "The road drain is blocked and the road gets waterlogged at ",
    polaroid: { photo: PHOTOS.polaroidDrain, position: "50% 62%", caption: "Drain dug, left open" },
  },
  {
    label: "Streetlight not working",
    icon: Lightbulb,
    starter: "The streetlights on the road are not working at ",
    polaroid: { photo: PHOTOS.polaroidStreetlight, position: "50% 50%", caption: "Streetlight dead for weeks" },
  },
  {
    label: "Road work left unfinished",
    icon: Construction,
    starter: "Road work was started but has been left unfinished at ",
    polaroid: { photo: PHOTOS.polaroidRoadwork, position: "30% 50%", caption: "Road dug up, then left" },
  },
];
