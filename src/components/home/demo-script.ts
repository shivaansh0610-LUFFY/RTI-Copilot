// The 30-second demo that plays inside the application sheet on the home page: the four steps
// of RTI Copilot, 7.5 seconds each. Everything it shows is something the app really does, in
// the app's own words: the officer checks are named as in the PIO review, and the reply
// findings use the reply analysis's labels.

export const SCENE_MS = 7500;
export const DEMO_MS = SCENE_MS * 4;

export const DEMO_STEPS: { title: string; caption: string }[] = [
  {
    title: "Describe it",
    caption: "Describe it: say what is wrong in your own words, with a photo and your location.",
  },
  {
    title: "Ask precisely",
    caption: "Ask precisely: the application asks for the exact records PWD must keep.",
  },
  {
    title: "Officer check",
    caption: "Officer check: it is read like a reluctant PIO would, and scored on 10 fixed checks.",
  },
  {
    title: "Check the reply",
    caption: "Check the reply: see what was answered, dodged or refused, then draft a first appeal.",
  },
];

// Scene 1: the citizen's own words, typed out.
export const DEMO_COMPLAINT = "The road outside our colony was repaired in March. It has broken again.";
export const DEMO_PLACE = "Ring Road, near the bus stop";

// Scene 2: the requests, as the drafting step writes them.
export const DEMO_REQUESTS: { text: string; cites?: string }[] = [
  { text: "A copy of the work order for the March repair of this road." },
  { text: "Copies of the Measurement Book entries for that work.", cites: "CPWD Works Manual" },
  { text: "Copies of the bills paid to the contractor for it." },
  { text: "An inspection of the work, and certified samples of the material used.", cites: "Section 2(j)" },
];

// Scene 3: five of the PIO review's ten checks, by their own labels.
export const DEMO_CHECKS = [
  "Says it is an RTI application under Section 6(1)",
  "Gives a time period",
  "Names the road or place",
  "Asks for records, not explanations or complaints",
  "Each request names a specific record",
];

// Scene 4: what the reply analysis found, one finding per request.
export type DemoTone = "good" | "part" | "bad";
export const DEMO_FINDINGS: { record: string; label: string; tone: DemoTone }[] = [
  { record: "Work order", label: "Responsive", tone: "good" },
  { record: "Measurement Book", label: "Partially responsive", tone: "part" },
  { record: "Bills", label: "No record stated", tone: "bad" },
  { record: "Inspection", label: "Non-responsive", tone: "bad" },
];

// When things happen inside a scene, in milliseconds from the scene's start.
export const TIMING = {
  typeFrom: 300,
  typeMsPerChar: 50,
  photoAt: 4700,
  placeAt: 5300,
  continueAt: 6500,
  requestAt: (i: number) => 500 + i * 1300,
  citeAfter: 450,
  languageAt: 5800,
  checkAt: (i: number) => 700 + i * 700,
  moreChecksAt: 4300,
  stampAt: 5100,
  findingAt: (i: number) => 600 + i * 900,
  appealAt: 4500,
  appealPressAt: 6300,
};
