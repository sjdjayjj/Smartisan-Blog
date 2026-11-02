import { ImageResponse } from "next/og";

/**
 * 社交分享图：1200×630。
 * next/og 默认字体只覆盖拉丁字符，这里刻意用英文排版，避免中文缺字。
 */
export const alt = "The Craftsman's Field · Smartisan Craftsmanship";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(160deg, #24262b 0%, #141416 65%)",
          padding: "64px 72px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: "linear-gradient(90deg, transparent, #d4232a 25%, #ea353c 50%, #d4232a 75%, transparent)",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(180deg, #2e3138, #1c1d21)",
              border: "1px solid rgba(255,255,255,0.16)",
              color: "#d4232a",
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            S
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ color: "#f5f5f7", fontSize: 22, letterSpacing: 6 }}>
              SMARTISAN CRAFTSMANSHIP
            </div>
            <div style={{ color: "#8e8e93", fontSize: 16, letterSpacing: 3, marginTop: 6 }}>
              @smartisandesign · EST. WITH PRIDE
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              color: "#ffffff",
              fontSize: 78,
              fontWeight: 700,
              letterSpacing: 1,
              lineHeight: 1.1,
            }}
          >
            THE CRAFTSMAN&apos;S FIELD
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 28 }}>
            <div style={{ width: 96, height: 2, background: "#d4232a" }} />
            <div style={{ color: "#c5a059", fontSize: 24, letterSpacing: 2 }}>
              Serious about 1px, tactile light and the fine red line.
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            paddingTop: 26,
          }}
        >
          <div style={{ color: "#8e8e93", fontSize: 18, letterSpacing: 2 }}>
            AN INDEPENDENT DIGITAL SPACE · 2026
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 84,
              height: 84,
              border: "2px solid #d4232a",
              color: "#ea353c",
              fontSize: 18,
              letterSpacing: 3,
              transform: "rotate(-5deg)",
            }}
          >
            PROUD
          </div>
        </div>
      </div>
    ),
    size
  );
}
