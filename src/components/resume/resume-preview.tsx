"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ResumeDocument } from "@/lib/schemas/resume";
import { previewFontCss, renderResumeHtml } from "@/lib/resume/template";

const A4_WIDTH_PX = 794; // 210 mm at 96 dpi

/**
 * Live preview using the exact HTML the PDF renderer prints. It is rendered in
 * a fully sandboxed iframe (no scripts, no same-origin access).
 */
export function ResumePreview({ doc, title }: { doc: ResumeDocument; title: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(1123);
  const html = useMemo(
    () =>
      renderResumeHtml(doc, { fontCss: previewFontCss(), title }).replace(
        "</style>",
        // Screen-only page simulation; print/PDF uses @page margins instead.
        `@media screen { body { padding: ${doc.layout === "compact" ? "12mm 13mm" : "14mm 15mm"}; } }</style>`,
      ),
    [doc, title],
  );

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / A4_WIDTH_PX)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrap} dir="ltr" className="w-full overflow-hidden rounded-lg border border-border bg-white shadow-sm" style={{ height: height * scale }}>
      <iframe
        title={title}
        sandbox="allow-same-origin"
        srcDoc={html}
        onLoad={(e) => {
          const d = e.currentTarget.contentDocument;
          if (d) setHeight(Math.max(1123, d.documentElement.scrollHeight));
        }}
        style={{ width: A4_WIDTH_PX, height, transform: `scale(${scale})`, transformOrigin: "top left", border: 0 }}
      />
    </div>
  );
}
