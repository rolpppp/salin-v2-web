import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import styles from "./card.module.css";

export type CardProps = HTMLAttributes<HTMLElement> & {
  /** "default" white lift; "next" Sea Glass (flat); "peak" Fern wash (flat). Tinted cards drop their shadow. */
  tone?: "default" | "next" | "peak";
  as?: ElementType;
  children?: ReactNode;
};

export function Card({ tone = "default", as: Tag = "section", className, children, ...rest }: CardProps) {
  return (
    <Tag {...rest} className={cn(styles.card, tone === "next" && styles.next, tone === "peak" && styles.peak, className)}>
      {children}
    </Tag>
  );
}

export function CardTitle({ as: Tag = "h2", className, ...rest }: HTMLAttributes<HTMLHeadingElement> & { as?: ElementType }) {
  return <Tag {...rest} className={cn(styles.title, className)} />;
}
