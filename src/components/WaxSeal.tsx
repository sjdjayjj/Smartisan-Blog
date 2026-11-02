"use client";

import { useId } from "react";
import { WAX_SEAL_RADIUS, sealDrip, sealLayout, sealOutline } from "@/lib/waxSeal";

/**
 * 火漆正印：落款印信，不是按钮。
 *
 * 蜡体是压扁的碟形——中心因印模压实而偏暗哑光，外缘隆起受光；
 * 压印文字做凹刻而不是浮雕；边缘形态由 lib/waxSeal 的固定点集决定，
 * 与长图导出共用一个轮廓。纯装饰时对读屏隐匿，需要朗读时传 label。
 */
export default function WaxSeal({
  lines,
  size = 84,
  rotation = -5,
  label,
  className = "",
}: {
  lines: string[];
  size?: number;
  rotation?: number;
  label?: string;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const centerX = 50;
  const centerY = 42;
  const radius = WAX_SEAL_RADIUS;
  const layout = sealLayout(lines);

  const body = sealOutline(centerX, centerY, radius);
  const solid = `${body} ${sealDrip(centerX, centerY, radius)}`;
  const rim = sealOutline(centerX, centerY, radius, 0.94);
  const dish = sealOutline(centerX, centerY, radius, 0.86);
  const dishLip = sealOutline(centerX, centerY, radius, 0.84);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`wax-seal ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <radialGradient id={`${uid}-core`} cx="50%" cy="46%" r="56%">
          <stop offset="0%" stopColor="rgba(0, 0, 0, 0.34)" />
          <stop offset="68%" stopColor="rgba(0, 0, 0, 0.08)" />
          <stop offset="100%" stopColor="rgba(0, 0, 0, 0.24)" />
        </radialGradient>
        <linearGradient id={`${uid}-light`} x1="22%" y1="6%" x2="80%" y2="94%">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.1)" />
          <stop offset="40%" stopColor="rgba(255, 255, 255, 0)" />
          <stop offset="100%" stopColor="rgba(0, 0, 0, 0.46)" />
        </linearGradient>
        <linearGradient id={`${uid}-rim`} x1="18%" y1="2%" x2="82%" y2="98%">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.34)" />
          <stop offset="40%" stopColor="rgba(255, 255, 255, 0.03)" />
          <stop offset="100%" stopColor="rgba(0, 0, 0, 0.6)" />
        </linearGradient>
        <linearGradient id={`${uid}-drip`} x1="30%" y1="0%" x2="70%" y2="100%">
          <stop offset="0%" stopColor="#d4232a" />
          <stop offset="100%" stopColor="#7f1d1d" />
        </linearGradient>
        <filter id={`${uid}-soft`} x="-45%" y="-45%" width="190%" height="190%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <filter id={`${uid}-grain`} x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <clipPath id={`${uid}-clip`}>
          <path d={body} />
        </clipPath>
      </defs>

      <g transform={`rotate(${rotation} ${centerX} ${centerY})`}>
        {/* 蜡渗纤维：边缘外一圈极淡的红晕，带毛边 */}
        <path
          d={solid}
          fill="#d4232a"
          opacity="0.12"
          filter={`url(#${uid}-soft)`}
          transform={`translate(${centerX} ${centerY}) scale(1.05) translate(${-centerX} ${-centerY})`}
        />
        {/* 蜡体投在纸面上的软阴影 */}
        <path
          d={solid}
          fill="rgba(0, 0, 0, 0.6)"
          filter={`url(#${uid}-soft)`}
          transform="translate(0.8 2.6)"
        />

        {/* 蜡体：中心压实的哑光暗红，越靠边越浓 */}
        <path d={solid} fill="#d4232a" />
        <path d={solid} fill={`url(#${uid}-core)`} />
        <path d={solid} fill={`url(#${uid}-light)`} />
        <path d={solid} fill="rgba(0, 0, 0, 0.08)" />

        {/* 极细的蜡质颗粒，只在靠近时能察觉 */}
        <g clipPath={`url(#${uid}-clip)`}>
          <rect
            x="0"
            y="0"
            width="100"
            height="100"
            filter={`url(#${uid}-grain)`}
            opacity="0.1"
            style={{ mixBlendMode: "overlay" }}
          />
        </g>

        {/* 被压扁的蜡沿：外缘一圈实体厚度，左上亮、右下暗 */}
        <path d={body} fill="none" stroke="rgba(0, 0, 0, 0.32)" strokeWidth="0.8" />
        <path d={rim} fill="none" stroke={`url(#${uid}-rim)`} strokeWidth="1.6" />

        {/* 中心碟形凹陷：内圈暗沟 + 下缘一道细反光 */}
        <path d={dish} fill="none" stroke="rgba(0, 0, 0, 0.24)" strokeWidth="1.2" />
        <path
          d={dishLip}
          fill="none"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth="0.7"
          transform="translate(0 0.9)"
        />

        {/* 蜡泪：最后画，盖住蜡体下缘的描边，像一小截溢出的熔蜡 */}
        <path
          d={sealDrip(centerX, centerY, radius)}
          fill={`url(#${uid}-drip)`}
          stroke="rgba(0, 0, 0, 0.28)"
          strokeWidth="0.55"
        />
        <path d={sealDrip(centerX, centerY, radius)} fill="rgba(0, 0, 0, 0.06)" />

        {/* 凹刻文字：字口内暗，下缘留一道细亮线 */}
        <g style={{ fontFamily: "var(--font-serif)", fontWeight: 700 }}>
          {layout.rows.map((row) => (
            <g key={row.text}>
              <text
                x={centerX}
                y={centerY + row.y + 0.6}
                textAnchor="middle"
                fontSize={layout.fontSize}
                letterSpacing={layout.letterSpacing}
                fill="rgba(255, 255, 255, 0.12)"
              >
                {row.text}
              </text>
              <text
                x={centerX}
                y={centerY + row.y}
                textAnchor="middle"
                fontSize={layout.fontSize}
                letterSpacing={layout.letterSpacing}
                fill="rgba(0, 0, 0, 0.52)"
              >
                {row.text}
              </text>
            </g>
          ))}
        </g>
      </g>
    </svg>
  );
}
