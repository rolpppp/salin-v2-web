import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";
import styles from "./button.module.css";

export type ButtonVariant = "primary" | "soft" | "quiet" | "warm";

type Shared = {
  variant?: ButtonVariant;
  /** Shows a busy state, keeps width, blocks clicks, sets aria-busy. */
  loading?: boolean;
  /** Visible label shown to assistive tech while loading, e.g. "Saving". */
  loadingLabel?: string;
  children: ReactNode;
};

export type ButtonProps = Shared & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { ref?: Ref<HTMLButtonElement> };

function classes(variant: ButtonVariant, loading: boolean | undefined, extra?: string) {
  return cn(styles.btn, styles[variant], loading && styles.loading, extra);
}

export function Button({
  variant = "soft",
  loading,
  loadingLabel,
  className,
  children,
  disabled,
  type = "button",
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={classes(variant, loading, className)}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      onClick={loading ? (e) => e.preventDefault() : onClick}
    >
      <span className={styles.label}>{children}</span>
      {loading ? (
        <>
          <span className={styles.dots} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {loadingLabel ? <span className="sr">{loadingLabel}</span> : null}
        </>
      ) : null}
    </button>
  );
}

export type ButtonLinkProps = { variant?: ButtonVariant; children: ReactNode; href: string } & Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "children" | "href"
>;

/** A link that looks like a Button (navigation, not an action). */
export function ButtonLink({ variant = "soft", className, children, href, ...rest }: ButtonLinkProps) {
  return (
    <Link {...rest} href={href} className={classes(variant, false, className)}>
      <span className={styles.label}>{children}</span>
    </Link>
  );
}
