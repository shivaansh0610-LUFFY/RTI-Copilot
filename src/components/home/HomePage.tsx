import { useRef } from "react";
import Closing, { StoryFooter } from "./Closing";
import Hero from "./Hero";
import HowItWorks from "./HowItWorks";
import { useScrollStory } from "./motion";
import ProblemCollage from "./ProblemCollage";
import ProblemString from "./ProblemString";
import RecordStrips from "./RecordStrips";
import RightToInformation from "./RightToInformation";
import "./story.css";

// The home page, told as a story in chapters: the slideshow hero, what RTI is, the problem,
// the records worth asking for, how it works (with the demo), the problems to start from,
// and a call to ask.
export default function HomePage({
  onStart,
  onAnalyse,
  onReview,
}: {
  onStart: (starter?: string) => void;
  onAnalyse: () => void;
  onReview?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useScrollStory(root);
  const startBlank = () => onStart();

  return (
    <div ref={root} className="story">
      <div aria-hidden="true" className="story-progress" />
      <div className="story-disclaimer">
        <p className="story-wrap">An independent citizen tool. Not a government website, and not run by PWD Delhi.</p>
      </div>
      <main>
        <Hero onStart={startBlank} onAnalyse={onAnalyse} onReview={onReview} />
        <RightToInformation />
        <ProblemCollage />
        <RecordStrips onStart={onStart} />
        <HowItWorks />
        <ProblemString onStart={onStart} />
        <Closing onStart={startBlank} onAnalyse={onAnalyse} onReview={onReview} />
      </main>
      <StoryFooter />
    </div>
  );
}
