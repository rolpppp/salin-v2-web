import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import styles from "./skeleton.module.css";

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  radius?: CSSProperties["borderRadius"];
};

/** Block shaped like the final content. Decorative; wrap a group in aria-busy and announce via useAnnounce if needed. */
export function Skeleton({ width = "100%", height = 16, radius, className, style, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      {...rest}
      className={cn(styles.sk, className)}
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}
