"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ImageUp } from "lucide-react";
import type { IScannerControls } from "@zxing/browser";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/config";
import { api, errorMessage } from "@/lib/api-client";
import { classifyQrPayload, type QrPayload } from "@/lib/jobs/qr";
import { detectFileType, isJobImage, MAX_JOB_IMAGE_BYTES } from "@/lib/files";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/primitives";
import { UrlIntake } from "./intake-tabs";

/** QR decoding with ZXing, from an uploaded image or the camera (with permission). */
export function QrIntake({ onCreated, onFallback }: { onCreated: (id: string) => void; onFallback: (tab: "url" | "image" | "qr" | "manual") => void }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const [scanning, setScanning] = useState(false);
  const [payload, setPayload] = useState<QrPayload | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const stop = () => {
    controls.current?.stop();
    controls.current = null;
    setScanning(false);
  };
  useEffect(() => stop, []);

  const handleDecoded = (raw: string) => {
    const p = classifyQrPayload(raw);
    setPayload(p);
    if (p.kind === "text") setText(p.text);
  };

  const fromImage = async (file: File) => {
    setError(null);
    setPayload(null);
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (file.size > MAX_JOB_IMAGE_BYTES || !isJobImage(detectFileType(head))) return setError(t.intake.invalidImage);
    const url = URL.createObjectURL(file);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(url);
      handleDecoded(result.getText());
    } catch {
      setError(t.intake.qrNotFound);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const startCamera = async () => {
    setError(null);
    setPayload(null);
    if (!navigator.mediaDevices?.getUserMedia) return setError(t.intake.qrCameraDenied);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      setScanning(true);
      controls.current = await new BrowserQRCodeReader().decodeFromVideoDevice(undefined, video.current!, (result, _err, ctl) => {
        if (result) {
          ctl.stop();
          controls.current = null;
          setScanning(false);
          handleDecoded(result.getText());
        }
      });
    } catch {
      setScanning(false);
      setError(t.intake.qrCameraDenied);
    }
  };

  const submitText = async () => {
    setSubmitting(true);
    try {
      const res = await api<{ opportunity: { id: string } }>("/api/opportunities/text", { body: { source_type: "qr", text, meta: {} } });
      onCreated(res.opportunity.id);
    } catch (err) {
      setError(errorMessage(err, t));
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => input.current?.click()} disabled={scanning}>
          <ImageUp aria-hidden />
          {t.intake.qrUpload}
        </Button>
        {scanning ? (
          <Button variant="secondary" onClick={stop}>
            <CameraOff aria-hidden />
            {t.intake.qrStopCamera}
          </Button>
        ) : (
          <Button variant="secondary" onClick={startCamera}>
            <Camera aria-hidden />
            {t.intake.qrCamera}
          </Button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label={t.intake.qrUpload}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void fromImage(f);
            e.target.value = "";
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t.intake.qrCameraHelp}</p>
      <video ref={video} className={scanning ? "aspect-video w-full max-w-md rounded-lg border border-border bg-black" : "hidden"} muted playsInline />
      {error && <Alert tone="danger">{error}</Alert>}

      {payload?.kind === "url" && (
        <div className="space-y-3">
          <p className="text-sm font-medium">{t.intake.qrDecodedUrl}</p>
          <UrlIntake onCreated={onCreated} onFallback={onFallback} initialUrl={payload.url} via="qr" />
        </div>
      )}
      {payload?.kind === "text" && (
        <div className="space-y-3">
          <Field id="qr-text" label={t.intake.qrDecodedText}>
            <Textarea id="qr-text" rows={8} dir="auto" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Button onClick={submitText} loading={submitting} disabled={text.trim().length < 40}>
            {t.intake.qrUseText}
          </Button>
        </div>
      )}
      {payload?.kind === "unsupported" && <Alert tone="warning">{format(t.intake.qrUnsupported, { kind: payload.type })}</Alert>}
    </div>
  );
}
