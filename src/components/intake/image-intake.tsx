"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUp } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/config";
import { api, errorMessage } from "@/lib/api-client";
import { detectFileType, isJobImage, MAX_JOB_IMAGE_BYTES } from "@/lib/files";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Textarea } from "@/components/ui/form-controls";
import { Alert, Badge, Progress } from "@/components/ui/primitives";

const LOW_CONFIDENCE = 60;

/**
 * OCR runs in the browser with Tesseract (English + Arabic). The image never
 * leaves the device; only the text the user reviews and approves is submitted.
 */
export function ImageIntake({ onCreated }: { onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [langs, setLangs] = useState({ eng: true, ara: true });
  const [progress, setProgress] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [lowWords, setLowWords] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const run = async (file: File) => {
    setError(null);
    setText("");
    setConfidence(null);
    setLowWords([]);
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (file.size > MAX_JOB_IMAGE_BYTES || !isJobImage(detectFileType(head))) {
      setError(t.intake.invalidImage);
      return;
    }
    setPreview(URL.createObjectURL(file));
    const selected = (Object.keys(langs) as ("eng" | "ara")[]).filter((l) => langs[l]);
    setProgress(0);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(selected.length ? selected : ["eng"], 1, {
        logger: (m) => {
          if (m.status === "recognizing text") setProgress(Math.round(m.progress * 100));
        },
      });
      try {
        const { data } = await worker.recognize(file, {}, { text: true, blocks: true });
        const words = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
        const low = [...new Set(words.filter((w) => w.confidence < LOW_CONFIDENCE && w.text.trim().length > 1).map((w) => w.text.trim()))];
        setText(data.text.trim());
        setConfidence(Math.round(data.confidence));
        setLowWords(low.slice(0, 100));
        if (!data.text.trim()) setError(t.intake.ocrFailed);
      } finally {
        await worker.terminate();
      }
    } catch {
      setError(t.intake.ocrFailed);
    } finally {
      setProgress(null);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ opportunity: { id: string } }>("/api/opportunities/text", {
        body: {
          source_type: "image",
          text,
          meta: {
            ocr_confidence: confidence ?? undefined,
            low_confidence_words: lowWords,
            ocr_languages: Object.keys(langs).filter((l) => langs[l as "eng" | "ara"]),
          },
        },
      });
      onCreated(res.opportunity.id);
    } catch (err) {
      setError(errorMessage(err, t));
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium">{t.intake.imageLabel}</p>
        <p className="text-xs text-muted-foreground">{t.intake.imageHelp}</p>
        <fieldset className="flex flex-wrap items-center gap-4 pt-1">
          <legend className="sr-only">{t.intake.ocrLanguages}</legend>
          <span className="text-xs text-muted-foreground">{t.intake.ocrLanguages}:</span>
          <label className="inline-flex items-center gap-2 text-sm">
            <Checkbox checked={langs.eng} onChange={(e) => setLangs((l) => ({ ...l, eng: e.target.checked }))} />
            English
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <Checkbox checked={langs.ara} onChange={(e) => setLangs((l) => ({ ...l, ara: e.target.checked }))} />
            العربية
          </label>
        </fieldset>
        <div>
          <Button variant="secondary" onClick={() => input.current?.click()} disabled={progress !== null}>
            <ImageUp aria-hidden />
            {t.intake.chooseImage}
          </Button>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label={t.intake.chooseImage}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void run(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {progress !== null && (
        <div className="space-y-2" aria-live="polite">
          <p className="text-sm">{format(t.intake.ocrRunning, { progress })}</p>
          <Progress value={progress} label={format(t.intake.ocrRunning, { progress })} />
        </div>
      )}
      {error && <Alert tone="danger">{error}</Alert>}

      {(text || preview) && progress === null && (
        <div className="grid gap-4 lg:grid-cols-2">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={preview} alt="" className="max-h-[480px] w-full rounded-lg border border-border object-contain" />
          )}
          {text && (
            <div className="space-y-3">
              <Alert tone="info" title={t.intake.ocrDone}>
                {confidence !== null && format(t.intake.ocrConfidence, { value: confidence })}
              </Alert>
              <Field id="ocr-text" label={t.intake.extractedText}>
                <Textarea id="ocr-text" rows={14} dir="auto" value={text} onChange={(e) => setText(e.target.value)} />
              </Field>
              {lowWords.length > 0 && (
                <Alert tone="warning" title={t.intake.ocrLowConfidence}>
                  <div className="flex flex-wrap gap-1 pt-1" aria-label={t.intake.ocrLowWords}>
                    {lowWords.map((w) => (
                      <Badge key={w} tone="warning" dir="auto">
                        {w}
                      </Badge>
                    ))}
                  </div>
                </Alert>
              )}
              <Button onClick={submit} loading={submitting} disabled={text.trim().length < 40}>
                {t.intake.analyzeText}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
