import QRCodeStyling, { type Options } from 'qr-code-styling';
import React, { useEffect, useMemo, useRef } from 'react';
import { hexToRgba, lightenHex } from '../../lib/color';
import { useSettingsStore } from '../../stores/settings';
import './qr-code.css';

interface QrCodeProps {
  payload: string;
  size?: number;
}

export const QrCode = React.memo(({ payload, size = 280 }: QrCodeProps) => {
  const accent = useSettingsStore((s) => s.accentColor);
  const ref = useRef<HTMLDivElement>(null);
  const qrRef = useRef<QRCodeStyling | null>(null);

  const accentLight = useMemo(() => lightenHex(accent, 0.35), [accent]);
  const accentSoft = useMemo(() => hexToRgba(accent, 0.55), [accent]);
  const accentGlow = useMemo(() => hexToRgba(accent, 0.45), [accent]);

  const options = useMemo<Options>(
    () => ({
      width: size,
      height: size,
      type: 'canvas',
      data: payload,
      margin: 0,
      qrOptions: { errorCorrectionLevel: 'M' },
      backgroundOptions: { color: 'transparent' },
      // Plain white code: no accent gradient, readable by any camera.
      dotsOptions: { type: 'rounded', color: '#ffffff' },
      cornersSquareOptions: { type: 'extra-rounded', color: '#ffffff' },
      cornersDotOptions: { type: 'dot', color: '#ffffff' },
    }),
    [payload, size],
  );

  useEffect(() => {
    if (!ref.current) return;
    if (!qrRef.current) {
      qrRef.current = new QRCodeStyling(options);
      qrRef.current.append(ref.current);
    } else {
      qrRef.current.update(options);
    }
  }, [options]);

  const cssVars = {
    '--qr-accent': accent,
    '--qr-accent-light': accentLight,
    '--qr-accent-soft': accentSoft,
    '--qr-accent-glow': accentGlow,
  } as React.CSSProperties;

  const frameSize = size + 56;

  return (
    <div className="qr-shell" style={{ ...cssVars, width: frameSize, height: frameSize }}>
      <div className="qr-aurora" aria-hidden />
      <div className="qr-rim">
        <div className="qr-frame">
          <div className="qr-mesh" aria-hidden />
          <div className="qr-specular" aria-hidden />
          <div className="qr-canvas">
            <div ref={ref} style={{ width: size, height: size }} />
          </div>
        </div>
      </div>
    </div>
  );
});
QrCode.displayName = 'QrCode';
