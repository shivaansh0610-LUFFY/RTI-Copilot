import chenab from "../../assets/home/chenab.jpg";
import collageFlood from "../../assets/home/collage-flood.jpg";
import collageFog from "../../assets/home/collage-fog.jpg";
import collagePotholes from "../../assets/home/collage-potholes.jpg";
import collageTraffic from "../../assets/home/collage-traffic.jpg";
import indiaGate from "../../assets/home/india-gate.jpg";
import monsoon from "../../assets/home/monsoon.jpg";
import nightRoad from "../../assets/home/night-road.jpg";
import polaroidDrain from "../../assets/home/polaroid-drain.jpg";
import polaroidFootpath from "../../assets/home/polaroid-footpath.jpg";
import polaroidPothole from "../../assets/home/polaroid-pothole.jpg";
import polaroidRepair from "../../assets/home/polaroid-repair.jpg";
import polaroidRoadwork from "../../assets/home/polaroid-roadwork.jpg";
import polaroidStreetlight from "../../assets/home/polaroid-streetlight.jpg";
import pothole from "../../assets/home/pothole.jpg";
import seaLink from "../../assets/home/sea-link.jpg";
import traffic from "../../assets/home/traffic.jpg";

// Every photo on the home page comes from Wikimedia Commons, and each is used once. Their
// licences (CC BY, CC BY-SA, GODL-India) require a credit, so the page shows one: the current
// slide's under the hero, and all of them in the footer.
export type Photo = {
  src: string;
  alt: string;
  // Short name for the credit line, linked to the photo's page.
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  page: string;
  // Any change beyond cropping, which the licences ask us to say.
  changed?: string;
};

const CC_BY_2 = { license: "CC BY 2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/" };
const CC_BY_3 = { license: "CC BY 3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/" };
const CC_BY_SA_3 = { license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/" };
const CC_BY_SA_4 = { license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" };
const CC0 = { license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" };
const GODL = {
  license: "GODL-India",
  licenseUrl: "https://data.gov.in/sites/default/files/Gazette_Notification_OGDL.pdf",
};
const COMMONS = "https://commons.wikimedia.org/wiki/File:";

export const PHOTOS = {
  // The hero slideshow.
  chenab: {
    src: chenab,
    alt: "The Chenab Rail Bridge",
    title: "Chenab Rail Bridge",
    author: "Konkan Railway Corporation",
    ...GODL,
    page: COMMONS + "Chenab_Rail_Bridge,_Reasi_district,_Jammu_and_Kashmir,_India.jpg",
  },
  pothole: {
    src: pothole,
    alt: "A broken road in New Delhi",
    title: "Broken road, New Delhi",
    author: "Rrthakur22",
    ...CC_BY_SA_4,
    page: COMMONS + "Broken_Roads_in_India%27s_Capital_New_Delhi.jpg",
  },
  traffic: {
    src: traffic,
    alt: "Traffic on Mathura Road, New Delhi",
    title: "Mathura Road traffic",
    author: "Biswarup Ganguly",
    ...CC_BY_3,
    page: COMMONS + "Traffic_Congestion_-_Mathura_Road_-_New_Delhi_2014-05-13_2739.JPG",
  },
  indiaGate: {
    src: indiaGate,
    alt: "India Gate on a hazy morning",
    title: "India Gate on a hazy morning",
    author: "Kaartik Negi",
    ...CC_BY_SA_4,
    page: COMMONS + "India_gate_6483441.jpg",
  },
  monsoon: {
    src: monsoon,
    alt: "A flooded street in the monsoon",
    title: "Monsoon street, Chennai",
    author: "McKay Savage",
    ...CC_BY_2,
    page: COMMONS + "India_-_Chennai_-_Monsoon_-_06_(3059058000).jpg",
  },
  seaLink: {
    src: seaLink,
    alt: "The Bandra–Worli Sea Link",
    title: "Bandra–Worli Sea Link",
    author: "Rajarshi Mitra",
    ...CC_BY_2,
    page: COMMONS + "Bandra_Worli_sea_link_-_Long_exposures!_(39513886421).jpg",
  },

  // The "01/ The problem" collage.
  collageTraffic: {
    src: collageTraffic,
    alt: "Cars, scooters and a cycle rickshaw jammed on a road in New Delhi",
    title: "Traffic, New Delhi",
    author: "Rrthakur22",
    ...CC_BY_SA_4,
    page: COMMONS + "Deltraffic1.jpg",
  },
  collagePotholes: {
    src: collagePotholes,
    alt: "An auto rickshaw driving through potholes full of water",
    title: "Driving through potholes",
    author: "KEmel49",
    ...CC_BY_SA_4,
    page: COMMONS + "Driving_through_potholes.jpg",
  },
  nightRoad: {
    src: nightRoad,
    alt: "A Delhi road at night",
    title: "Delhi's Night Traffic",
    author: "Gabriele Giuseppini",
    ...CC_BY_3,
    page: COMMONS + "Delhi%27s_Night_Traffic_-_panoramio.jpg",
    changed: "toned blue",
  },
  collageFog: {
    src: collageFog,
    alt: "An auto rickshaw and schoolchildren on a road in thick winter fog, New Delhi",
    title: "Fog in New Delhi",
    author: "the Ministry of Environment, Forest and Climate Change",
    ...GODL,
    page:
      COMMONS +
      "The_traffic_moving_slowly_with_opening_headlights_due_to_heavy_fog_in_the_morning,_in_New_Delhi_on_January_23,_2010.jpg",
  },
  collageFlood: {
    src: collageFlood,
    alt: "A market road under water after rain, Amritsar",
    title: "Flooded road, Amritsar",
    author: "Nitin Chandra",
    ...CC0,
    page: COMMONS + "Flooded_road_in_Amritsar,_July_2013.jpg",
  },

  // The polaroids, one per problem the page offers to start from.
  polaroidPothole: {
    src: polaroidPothole,
    alt: "Potholes in a city street beside the kerb, Kolkata",
    title: "Potholes, Kolkata",
    author: "Sbb1413",
    ...CC_BY_SA_3,
    page: COMMONS + "Potholes_(1_November_2026).jpg",
  },
  polaroidRepair: {
    src: polaroidRepair,
    alt: "A patched road surface already breaking up, Bengaluru",
    title: "Deformed road, Bengaluru",
    author: "Gangaasoonu",
    ...CC_BY_SA_4,
    page: COMMONS + "Roads_deformed_T_munnekollala_Bengaluru.jpg",
  },
  polaroidFootpath: {
    src: polaroidFootpath,
    alt: "People walking past a footpath of broken stone slabs, Bangalore",
    title: "Messy sidewalk, Bangalore",
    author: "Ryan from Toronto",
    ...CC_BY_2,
    page: COMMONS + "Messy_sidewalk_(6627577717).jpg",
  },
  polaroidDrain: {
    src: polaroidDrain,
    alt: "A drain dug along a row of shops and left open",
    title: "Drain yet to build",
    author: "KEmel49",
    ...CC_BY_SA_4,
    page: COMMONS + "Drain_yet_to_build_(1).jpg",
  },
  polaroidStreetlight: {
    src: polaroidStreetlight,
    alt: "A dark road at night, lit only by a motorbike’s headlight",
    title: "Bullet night light",
    author: "Jegan12345",
    ...CC_BY_SA_4,
    page: COMMONS + "Bullet_night_light.jpg",
  },
  polaroidRoadwork: {
    src: polaroidRoadwork,
    alt: "A street dug up for a new road, with an earth mover and piles of gravel, Nagpur",
    title: "Cement road construction, Nagpur",
    author: "Ganesh Dhamodkar",
    ...CC_BY_SA_4,
    page: COMMONS + "Cement_road_construction_JCB_Nagpur_02.jpg",
  },
} satisfies Record<string, Photo>;

// The hero slideshow: each photo with the question it raises and the record that answers it.
export const SLIDES: { photo: Photo; position: string; question: string; ask: string }[] = [
  {
    photo: PHOTOS.chenab,
    position: "50% 45%",
    question: "Built with public money.",
    ask: "how much was sanctioned, and how much was actually spent.",
  },
  {
    photo: PHOTOS.pothole,
    position: "50% 35%",
    question: "Pothole outside your house?",
    ask: "the work order and the Measurement Book entries for its last repair.",
  },
  {
    photo: PHOTOS.traffic,
    position: "50% 55%",
    question: "Stuck behind road work for months?",
    ask: "the completion date in the contract, and any penalty for delay.",
  },
  {
    photo: PHOTOS.indiaGate,
    position: "50% 40%",
    question: "Dust and smog every winter?",
    ask: "the dates your road was machine-swept and sprinkled with water.",
  },
  {
    photo: PHOTOS.monsoon,
    position: "50% 50%",
    question: "Road floods every monsoon?",
    ask: "the drain desilting record from before the rains.",
  },
  {
    photo: PHOTOS.seaLink,
    position: "50% 40%",
    question: "Every public work leaves a paper trail.",
    ask: "the contract, the bills and the completion certificate.",
  },
];

// The collage: where each photo sits (as a share of the collage box) and how far it slides
// as the collage scrolls past. Opposite signs make neighbours move against each other.
export type CollagePiece = {
  photo: Photo;
  position: string;
  box: { left: string; top: string; width: string; height: string };
  drift: number;
};

export const COLLAGE: CollagePiece[] = [
  {
    photo: PHOTOS.collageTraffic,
    position: "40% 60%",
    box: { left: "0%", top: "8%", width: "46%", height: "60%" },
    drift: 90,
  },
  {
    photo: PHOTOS.collagePotholes,
    position: "50% 55%",
    box: { left: "50%", top: "0%", width: "28%", height: "34%" },
    drift: 150,
  },
  {
    photo: PHOTOS.nightRoad,
    position: "50% 50%",
    box: { left: "82%", top: "4%", width: "18%", height: "26%" },
    drift: 60,
  },
  {
    photo: PHOTOS.collageFog,
    position: "50% 50%",
    box: { left: "56%", top: "40%", width: "44%", height: "52%" },
    drift: -70,
  },
  {
    photo: PHOTOS.collageFlood,
    position: "50% 62%",
    box: { left: "10%", top: "72%", width: "30%", height: "28%" },
    drift: -120,
  },
];
