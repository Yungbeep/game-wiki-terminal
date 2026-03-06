"use client";

import { useEffect, useMemo, useState } from "react";

type LogLine = {
  text: string;
  progress?: number;
};

const bootSequence: LogLine[] = [
  { text: "Connecting to mirror: UESC.MAIN.ARCHIVE" },
  { text: "Selecting fastest server: 192.0.2.15 (ping: 18ms)" },
  { text: "Initiating secure connection... Success" },
  { text: "Resolving dependencies..." },
  { text: "Total download size: 143MB" },
  { text: "Checking available space... OK" },
  { text: "" },
  { text: "Downloading package 1/12: bng-goliath-8.3.2-5", progress: 25 },
  { text: "Downloading package 2/12: bng-tiger-5.11.6-3", progress: 30 },
  { text: "Mirror latency: 9ms" },
  { text: "Downloading package 3/12: uesc.main-2.3.5", progress: 45 },
  { text: "Connected to mirror: uesc.archive.repo" },
  { text: "Downloading package 4/12: bng-goliath-1.2", progress: 47 },
  { text: "Verifying checksum... Passed" },
  { text: "Downloading package 5/12: core-1.1.1-k1", progress: 50 },
  { text: "Switching to backup mirror: tau.uesc.archive.repo" },
  { text: "Downloading package 6/12: TauCety.auth.UESC", progress: 62 },
  { text: "Network speed: 3.2MB/s average" },
  { text: "Downloading package 7/12: vulcan-6.0.1-7", progress: 72 },
  { text: "Retrieving metadata..." },
  { text: "Downloading package 8/12: vulcan-8.45-1", progress: 80 },
  { text: "Verifying signature... OK" },
  { text: "Downloading package 9/12: vulcan-3.42-4", progress: 85 },
  { text: "HTTP/4 connection established" },
  { text: "Downloading package 10/12: bng-SEC-5.2.5-2", progress: 93 },
  { text: "Disk activity: Normal" },
  { text: "Downloading package 11/12: core-2.9.12-4", progress: 100 },
  { text: "Timeout detected: Retrying... Success" },
  { text: "" },
  { text: "TRANSFER COMPLETE." },
];

function padProgress(progress: number) {
  const total = 18;
  const filled = Math.round((progress / 100) * total);
  const empty = total - filled;
  return `[${"=".repeat(filled)}${"-".repeat(empty)}] ${progress}%`;
}

export default function TerminalUI() {
  const [visibleLines, setVisibleLines] = useState<LogLine[]>([]);
  const [currentTime, setCurrentTime] = useState("");
  const [complete, setComplete] = useState(false);

  const footerCode = useMemo(() => {
    return `V-${Math.floor(100 + Math.random() * 900)}.${Math.floor(10 + Math.random() * 90)}`;
  }, []);

  useEffect(() => {
    let index = 0;

    const interval = setInterval(() => {
      if (index < bootSequence.length) {
        setVisibleLines((prev) => [...prev, bootSequence[index]]);
        index += 1;
      } else {
        setComplete(true);
        clearInterval(interval);
      }
    }, 140);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="crt-shell">
      <div className="crt-screen">
        <div className="crt-header">
          <div className="crt-brand">NuCaloric</div>
          <div className="crt-status">
            <span>S EDEN 14</span>
            <span>EN/4</span>
            <span className="crosshair">┼</span>
          </div>
        </div>

        <div className="crt-body">
          <div className="crt-left">
            <div className="crt-sidebar">
              <div>Ø—</div>
              <div>E01</div>
              <div>E03</div>
            </div>

            <div className="crt-logs">
              {visibleLines.map((line, i) => (
                <div key={`${line.text}-${i}`} className="crt-line">
                  {line.text === "TRANSFER COMPLETE." ? (
                    <div className="crt-complete">{line.text}</div>
                  ) : line.progress !== undefined ? (
                    <div className="crt-progress-line">
                      <span>{line.text}</span>
                      <span>{padProgress(line.progress)}</span>
                    </div>
                  ) : line.text === "" ? (
                    <div className="crt-spacer" />
                  ) : (
                    <span>{line.text}</span>
                  )}
                </div>
              ))}

              {!complete && (
                <div className="crt-line">
                  <span className="crt-cursor">█</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="crt-footer">
          <div>+++</div>
          <div>{currentTime}</div>
          <div>{footerCode}</div>
        </div>

        <div className="crt-overlay-scanlines" />
        <div className="crt-overlay-vignette" />
        <div className="crt-overlay-flicker" />
      </div>
    </div>
  );
}