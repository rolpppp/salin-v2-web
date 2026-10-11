import Image from "next/image";
import Link from "next/link";
import styles from "./header.module.css";

export function Logo({ href = "/today" }: { href?: string }) {
  return (
    <Link href={href} className={styles.brand}>
      <Image src="/logo.png" alt="" width={28} height={26} priority />
      <span>Salin</span>
    </Link>
  );
}
