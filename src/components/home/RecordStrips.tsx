import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { REPAIR_STARTER } from "./problems";
import { RECORDS } from "./records";
import "./records.css";

// "02/": the records worth asking for, as strips that open one at a time.
export default function RecordStrips({ onStart }: { onStart: (starter?: string) => void }) {
  const [open, setOpen] = useState(1);

  return (
    <section aria-labelledby="records-title" className="records-section">
      <div className="story-wrap records-layout">
        <div className="records-intro">
          <p className="story-hand records-hand">Your road, your records</p>
          <p className="story-num records-num">02/</p>
          <h2 id="records-title" className="story-title records-title">
            Five records that turn a complaint into evidence.
          </h2>
          <div className="records-law">
            <svg width="118" height="96" viewBox="0 0 118 96" fill="none" aria-hidden="true" className="records-sketch">
              <path d="M44 82L56 16h6l12 66" />
              <path d="M36 82h46" />
              <path d="M50 46h18M47 62h24" stroke="#B42318" />
              <ellipse cx="94" cy="86" rx="18" ry="5" />
              <path d="M76 88l-8 5M110 84l6-3M94 81l1-6" />
              <path d="M4 92h110" />
            </svg>
            <div>
              <p>
                Section 2(j) of the RTI Act lets you ask for copies of records, inspect the work
                itself, and take certified samples of the material used.{" "}
                <span className="records-muted">(Open each record.)</span>
              </p>
              <button type="button" onClick={() => onStart(REPAIR_STARTER)} className="story-link records-inspect">
                A repair broke again? Start with an inspection
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <div data-reveal className="records-reveal">
          <div className="records">
            {RECORDS.map((record, k) => {
              const isOpen = k === open;
              const panelId = `record-panel-${k}`;
              return (
                <div key={record.title} className={"record" + (isOpen ? " is-open" : "")}>
                  <h3>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setOpen(k)}
                      className="record-tab"
                    >
                      <span className="record-num">{String(k + 1).padStart(2, "0")}/</span>
                      <span className="record-name">{record.title}</span>
                    </button>
                  </h3>
                  {isOpen && (
                    <div id={panelId} className="record-panel">
                      <p>{record.what}</p>
                      <p className="record-why">
                        <span>Why ask: </span>
                        {record.why}
                      </p>
                      <p className="record-law">{record.law}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
