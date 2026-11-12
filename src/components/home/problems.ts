import { Construction, Droplets, Footprints, Hammer, Lightbulb, TriangleAlert, type LucideIcon } from "lucide-react";

// Only problems that PWD Delhi, the authority this app drafts for, is responsible for on its
// roads. Garbage, for instance, is the municipal corporation's job, so it is left out rather
// than sending a citizen to the wrong office.
// A repair that did not last: the complaint the inspection and samples offer is made for.
export const REPAIR_STARTER = "The road was repaired recently but it has already broken again at ";

export const PROBLEMS: { label: string; icon: LucideIcon; starter: string }[] = [
  {
    label: "Pothole or broken road",
    icon: TriangleAlert,
    starter: "There is a pothole / broken road surface at ",
  },
  {
    label: "Repair broke again quickly",
    icon: Hammer,
    starter: REPAIR_STARTER,
  },
  {
    label: "Broken footpath",
    icon: Footprints,
    starter: "The footpath is broken and unsafe to walk on at ",
  },
  {
    label: "Waterlogging or blocked drain",
    icon: Droplets,
    starter: "The road drain is blocked and the road gets waterlogged at ",
  },
  {
    label: "Streetlight not working",
    icon: Lightbulb,
    starter: "The streetlights on the road are not working at ",
  },
  {
    label: "Road work left unfinished",
    icon: Construction,
    starter: "Road work was started but has been left unfinished at ",
  },
];
