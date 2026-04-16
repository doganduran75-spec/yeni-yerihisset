import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "YeriHisset";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Logo / İsim */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #3b82f6, #6366f1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "40px",
            }}
          >
            🛍
          </div>
          <span
            style={{
              fontSize: "64px",
              fontWeight: "800",
              color: "#ffffff",
              letterSpacing: "-2px",
            }}
          >
            YeriHisset
          </span>
        </div>

        {/* Slogan */}
        <div
          style={{
            fontSize: "28px",
            color: "#94a3b8",
            fontWeight: "400",
            textAlign: "center",
            maxWidth: "700px",
          }}
        >
          Kaliteli Alışveriş ve Bilgi Platformu
        </div>

        {/* Alt çizgi / URL */}
        <div
          style={{
            position: "absolute",
            bottom: "40px",
            fontSize: "18px",
            color: "#475569",
          }}
        >
          yerihisset.com
        </div>
      </div>
    ),
    { ...size }
  );
}
